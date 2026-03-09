import { prisma } from "../prisma.ts";
import { redis } from "../redis.ts";
import { processWebhookEvent } from "../../routes/webhooks/transfeera/handler.ts";

const RECOVERY_INTERVAL_MS = 30_000; // 30 segundos
const BATCH_SIZE = 10;               // máximo de webhooks processados por ciclo
const MAX_ATTEMPTS = 5;              // após 5 falhas, marcar como FAILED definitivo

let recoveryTimer: ReturnType<typeof setInterval> | null = null;

async function runRecoveryCycle() {
  // 1. Verificar se Redis está online
  try {
    await redis.ping();
  } catch {
    console.log("🔴 [RECOVERY] Redis ainda offline — aguardando próximo ciclo");
    return;
  }

  // 2. Buscar webhooks pendentes
  const pending = await prisma.pendingWebhook.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) return;

  console.log(`🔄 [RECOVERY] ${pending.length} webhook(s) pendente(s) — iniciando reprocessamento`);

  // Batch update to PROCESSING
  const pendingIds = pending.map((w) => w.id);
  await prisma.pendingWebhook.updateMany({
    where: { id: { in: pendingIds } },
    data: { status: "PROCESSING" },
  });

  for (const webhook of pending) {

    const log = {
      info:  (m: string) => console.log(`ℹ️  [RECOVERY:${webhook.id.slice(0, 8)}] ${m}`),
      warn:  (m: string) => console.warn(`⚠️  [RECOVERY:${webhook.id.slice(0, 8)}] ${m}`),
      error: (m: string) => console.error(`❌ [RECOVERY:${webhook.id.slice(0, 8)}] ${m}`),
    };

    try {
      await processWebhookEvent(webhook.payload, log);

      await prisma.pendingWebhook.update({
        where: { id: webhook.id },
        data: {
          status: "DONE",
          processedAt: new Date(),
          error: null,
        },
      });

      console.log(`✅ [RECOVERY] Webhook reprocessado | id: ${webhook.id.slice(0, 8)} | object: ${webhook.object}`);
    } catch (err: any) {
      const newAttempts = webhook.attempts + 1;
      const finalFail = newAttempts >= MAX_ATTEMPTS;

      await prisma.pendingWebhook.update({
        where: { id: webhook.id },
        data: {
          status: finalFail ? "FAILED" : "PENDING",
          attempts: newAttempts,
          error: err?.message ?? "Erro desconhecido",
        },
      });

      if (finalFail) {
        console.error(`❌ [RECOVERY] Webhook falhou definitivamente após ${MAX_ATTEMPTS} tentativas | id: ${webhook.id.slice(0, 8)} | object: ${webhook.object} | erro: ${err?.message}`);
      } else {
        console.warn(`⚠️  [RECOVERY] Tentativa ${newAttempts}/${MAX_ATTEMPTS} falhou | id: ${webhook.id.slice(0, 8)} | erro: ${err?.message}`);
      }
    }
  }
}

export function startWebhookRecoveryWorker() {
  console.log(`🔄 [RECOVERY] Worker iniciado (intervalo: ${RECOVERY_INTERVAL_MS / 1000}s, batch: ${BATCH_SIZE})`);

  // Executar imediatamente ao iniciar, depois a cada 30s
  runRecoveryCycle().catch((err) => console.error("❌ [RECOVERY] Erro no ciclo inicial:", err));

  recoveryTimer = setInterval(() => {
    runRecoveryCycle().catch((err) => console.error("❌ [RECOVERY] Erro no ciclo:", err));
  }, RECOVERY_INTERVAL_MS);

  return {
    close: async () => {
      if (recoveryTimer) {
        clearInterval(recoveryTimer);
        recoveryTimer = null;
        console.log("✅ [RECOVERY] Worker encerrado");
      }
    },
  };
}
