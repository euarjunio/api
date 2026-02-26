import { Queue, Worker } from "bullmq";
import { env } from "../config/env.ts";
import { getPlugin } from "./tracker.registry.ts";
import type { TrackingEventData } from "./tracker.interface.ts";
import { captureError } from "../lib/sentry.ts";
import { prisma } from "../lib/prisma.ts";

// ── Tipos ────────────────────────────────────────────────────────────

export interface TrackingJobData {
  pluginName: string;
  credentials: Record<string, any>;
  event: "purchase" | "refund";
  data: TrackingEventData;
  merchantId: string;
  trackingId?: string; // ID do MerchantTracking (para FK no log)
}

// ── Fila ─────────────────────────────────────────────────────────────

export const trackingQueue = new Queue<TrackingJobData, void, string>("tracking-events", {
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 }, // 30s, 60s, 120s
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  },
});

// ── Helper para gravar log ───────────────────────────────────────────

async function saveTrackingLog(
  data: TrackingJobData,
  status: "success" | "failed",
  error?: string,
) {
  try {
    await prisma.trackingLog.create({
      data: {
        provider: data.pluginName,
        event: data.event,
        status,
        chargeId: data.data.chargeId ?? null,
        error: error?.slice(0, 500) ?? null,
        merchantId: data.merchantId,
        trackingId: data.trackingId ?? null,
      },
    });
  } catch (err) {
    console.error("🔌 [TRACKING] Falha ao gravar log:", (err as Error).message);
  }
}

// ── Worker ───────────────────────────────────────────────────────────

export function startTrackingWorker() {
  const worker = new Worker<TrackingJobData>(
    "tracking-events",
    async (job) => {
      const { pluginName, credentials, event, data, merchantId } = job.data;
      const attempt = job.attemptsMade + 1;
      const plugin = getPlugin(pluginName);

      if (!plugin) {
        console.warn(`🔌 [TRACKING] Plugin "${pluginName}" não encontrado — ignorando`);
        return;
      }

      console.log(
        `🔌 [TRACKING] Tentativa ${attempt}/${job.opts.attempts} | plugin: ${plugin.name} | event: ${event} | chargeId: ${data.chargeId} | merchant: ${merchantId}`,
      );

      await plugin.sendEvent(credentials, event, data);

      console.log(
        `🔌 [TRACKING] ✅ ${plugin.name} enviado com sucesso | chargeId: ${data.chargeId}`,
      );

      // ✅ Gravar log de sucesso
      await saveTrackingLog(job.data, "success");
    },
    {
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 5,
    },
  );

  worker.on("failed", async (job, err) => {
    if (job) {
      const remaining = (job.opts.attempts ?? 1) - job.attemptsMade;
      if (remaining > 0) {
        console.warn(
          `🔌 [TRACKING] Retry agendado | plugin: ${job.data.pluginName} | restantes: ${remaining} | erro: ${err.message.slice(0, 150)}`,
        );
      } else {
        console.error(
          `🔌 [TRACKING] ❌ Todas as tentativas falharam | plugin: ${job.data.pluginName} | chargeId: ${job.data.data.chargeId}`,
        );
        captureError(err, {
          plugin: job.data.pluginName,
          chargeId: job.data.data.chargeId,
          merchantId: job.data.merchantId,
        });

        // ❌ Gravar log de falha (só na última tentativa)
        await saveTrackingLog(job.data, "failed", err.message);
      }
    }
  });

  worker.on("error", (err) => {
    console.error("🔌 [TRACKING] Erro no worker:", err.message);
  });

  console.log("🔌 [TRACKING] Worker iniciado (concurrency: 5)");

  return worker;
}
