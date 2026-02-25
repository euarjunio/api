import { env } from "./config/env.ts";
import { startWebhookWorker } from "./lib/queues/webhook-queue.ts";
import { startSettlementWorker } from "./lib/queues/settlement-queue.ts";
import { registerShutdown } from "./lib/shutdown.ts";

console.log(`🔧 [WORKER] Iniciando workers (APP_ENV: ${env.APP_ENV})...`);

const webhookWorker = startWebhookWorker();
const settlementWorker = startSettlementWorker();

console.log("✅ [WORKER] Todos os workers iniciados");

// ── Graceful Shutdown ─────────────────────────────────────────────
registerShutdown("WORKER-SHUTDOWN", [
  { name: "Webhook worker", close: () => webhookWorker.close() },
  { name: "Settlement worker", close: () => settlementWorker.close() },
]);
