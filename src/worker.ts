import { env } from "./config/env.ts";
import { startWebhookWorker } from "./lib/queues/webhook-queue.ts";
import { startSettlementWorker } from "./lib/queues/settlement-queue.ts";
import { startTrackingWorker } from "./plugins/tracker.queue.ts";
import { startEmailWorker } from "./lib/queues/email-queue.ts";
import { registerShutdown } from "./lib/shutdown.ts";
import { verifyEmailConnection } from "./lib/email.ts"; // Adicionar import

console.log(`🔧 [WORKER] Iniciando workers (${env.NODE_ENV})...`);

// Verificar conexão SMTP antes de iniciar
verifyEmailConnection().catch(() => {
  console.warn("⚠️  [WORKER] SMTP offline, emails ficarão na fila.");
});

const webhookWorker = startWebhookWorker();
const settlementWorker = startSettlementWorker();
const trackingWorker = startTrackingWorker();
const emailWorker = startEmailWorker();

console.log("✅ [WORKER] Todos os workers iniciados");

// ── Graceful Shutdown ─────────────────────────────────────────────
registerShutdown("WORKER-SHUTDOWN", [
  { name: "Webhook worker", close: () => webhookWorker.close() },
  { name: "Settlement worker", close: () => settlementWorker.close() },
  { name: "Tracking worker", close: () => trackingWorker.close() },
  { name: "Email worker", close: () => emailWorker.close() },
]);
