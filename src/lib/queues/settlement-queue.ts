import { Queue, Worker } from "bullmq";
import { env } from "../../config/env.ts";
import { ledgerService } from "../../services/ledger.service.ts";
import { captureError } from "../sentry.ts";
import { invalidate, invalidatePattern, CacheKeys } from "../cache.ts";

// ── Tipos ────────────────────────────────────────────────────────────
export interface SettlementJobData {
  chargeId: string;
  merchantId: string;
  txid: string;
  grossAmount: number;
  feeAmount: number;
}

// ── Fila ─────────────────────────────────────────────────────────────
export const settlementQueue = new Queue<SettlementJobData, void, string>("settlement", {
  // Use connection options (not an ioredis instance) to avoid type conflicts from nested ioredis deps.
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 30_000, // 30s, 60s, 120s
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

// ── Worker ───────────────────────────────────────────────────────────
export function startSettlementWorker() {
  const worker = new Worker<SettlementJobData>(
    "settlement",
    async (job) => {
      const { chargeId, merchantId, txid, grossAmount, feeAmount } = job.data;

      console.log(
        `🏦 [SETTLEMENT] Liquidando cobrança | chargeId: ${chargeId} | txid: ${txid} | bruto: R$ ${(grossAmount / 100).toFixed(2)} | taxa: R$ ${(feeAmount / 100).toFixed(2)}`
      );

      const count = await ledgerService.liquidateByCharge(chargeId);

      if (count === 0) {
        console.warn(
          `🏦 [SETTLEMENT] Nenhuma entrada PENDING encontrada | chargeId: ${chargeId} (já liquidado?)`
        );
        return;
      }

      // Invalidar caches: balance + transactions (liquidação altera status)
      await Promise.all([
        invalidate(CacheKeys.balance(merchantId)),
        invalidatePattern(`cache:transactions:${merchantId}:*`),
      ]);

      const net = ((grossAmount - feeAmount) / 100).toFixed(2);
      console.log(
        `🏦 [SETTLEMENT] ✅ Liquidado | chargeId: ${chargeId} | ${count} entradas → AVAILABLE | líquido: R$ ${net} | merchantId: ${merchantId}`
      );
    },
    {
      // Use connection options (not an ioredis instance) to avoid type conflicts from nested ioredis deps.
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 10,
    },
  );

  worker.on("failed", (job, err) => {
    if (job) {
      const remaining = (job.opts.attempts ?? 1) - job.attemptsMade;
      if (remaining > 0) {
        console.warn(
          `🏦 [SETTLEMENT] Retry agendado | chargeId: ${job.data.chargeId} | restantes: ${remaining} | erro: ${err.message.slice(0, 150)}`
        );
      } else {
        console.error(
          `🏦 [SETTLEMENT] ❌ Todas tentativas falharam | chargeId: ${job.data.chargeId} | merchantId: ${job.data.merchantId}`
        );
        captureError(err, { chargeId: job.data.chargeId, merchantId: job.data.merchantId, txid: job.data.txid });
      }
    }
  });

  worker.on("error", (err) => {
    console.error("🏦 [SETTLEMENT] Erro no worker:", err.message);
  });

  console.log(
    `🏦 [SETTLEMENT] Worker iniciado (concurrency: 10, delay: ${env.SETTLEMENT_DELAY_MS}ms)`
  );

  return worker;
}
