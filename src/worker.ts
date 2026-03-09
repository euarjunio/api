import { env } from "./config/env.ts";
import { startWebhookWorker } from "./lib/queues/webhook-queue.ts";
import { startSettlementWorker } from "./lib/queues/settlement-queue.ts";
import { startTrackingWorker } from "./plugins/tracker.queue.ts";
import { startEmailWorker } from "./lib/queues/email-queue.ts";
import { startWebhookRecoveryWorker } from "./lib/queues/webhook-recovery.ts";
import { startChargeExpirationWorker } from "./lib/queues/charge-expiration.ts";
import { startAuditWorker } from "./lib/queues/audit-queue.ts";
import { registerShutdown } from "./lib/shutdown.ts";
import { verifyEmailConnection } from "./lib/email.ts";

console.log(`🔧 [WORKER] Iniciando workers (${env.NODE_ENV})...`);

// Verificar conexão SMTP antes de iniciar
verifyEmailConnection().catch(() => {
  console.warn("⚠️  [WORKER] SMTP offline, emails ficarão na fila.");
});

const webhookWorker = startWebhookWorker();
const settlementWorker = startSettlementWorker();
const trackingWorker = startTrackingWorker();
const emailWorker = startEmailWorker();
const recoveryWorker = startWebhookRecoveryWorker();
const expirationWorker = startChargeExpirationWorker();
const auditWorker = startAuditWorker();

console.log("✅ [WORKER] Todos os workers iniciados");

// ── Graceful Shutdown ─────────────────────────────────────────────
registerShutdown("WORKER-SHUTDOWN", [
  { name: "Webhook worker", close: () => webhookWorker.close() },
  { name: "Settlement worker", close: () => settlementWorker.close() },
  { name: "Tracking worker", close: () => trackingWorker.close() },
  { name: "Email worker", close: () => emailWorker.close() },
  { name: "Recovery worker", close: () => recoveryWorker.close() },
  { name: "Expiration worker", close: () => expirationWorker.close() },
  { name: "Audit worker", close: () => auditWorker.close() },
]);
