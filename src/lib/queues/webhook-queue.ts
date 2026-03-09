import { Queue, Worker } from "bullmq";
import { createHmac } from "node:crypto";
import { prisma } from "../prisma.ts";
import { env } from "../../config/env.ts";
import { captureError } from "../sentry.ts";

const SENSITIVE_PATTERNS = /("(?:password|token|secret|key|authorization|cookie|session|api_key|access_token|refresh_token|private)[^"]*"\s*:\s*)"[^"]*"/gi;

function sanitizeWebhookResponse(text: string | null): string | null {
  if (!text) return null;
  return text.slice(0, 500).replace(SENSITIVE_PATTERNS, '$1"[REDACTED]"');
}

// ── Tipos ────────────────────────────────────────────────────────────
export interface WebhookJobData {
  merchantId: string;
  webhookId: string;
  deliveryId: string;
  url: string;
  secret: string;
  event: string;
  payload: any;
}

// ── Fila ─────────────────────────────────────────────────────────────
export const webhookQueue = new Queue<WebhookJobData, void, string>("webhook-delivery", {
  // Use connection options (not an ioredis instance) to avoid type conflicts from nested ioredis deps.
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    attempts: env.MERCHANT_WEBHOOK_MAX_RETRIES + 1, // 1ª tentativa + N retries
    backoff: {
      type: "exponential",
      delay: 60_000, // 1ª retry após 1 min, depois 2 min, 4 min, 8 min...
    },
    removeOnComplete: { count: 500 },   // mantém últimos 500 jobs completos
    removeOnFail: { count: 1000 },       // mantém últimos 1000 jobs falhados
  },
});

// ── Worker ───────────────────────────────────────────────────────────
export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    "webhook-delivery",
    async (job) => {
      const { merchantId, webhookId, deliveryId, url, secret, event, payload } = job.data;
      const attempt = job.attemptsMade + 1;

      console.log(
        `📤 [WEBHOOK-WORKER] Tentativa ${attempt}/${job.opts.attempts} | event: ${event} | url: ${url} | deliveryId: ${deliveryId}`
      );

      const body = JSON.stringify({
        event,
        data: payload,
        deliveryId,
        timestamp: Date.now(),
      });

      const timeout = env.MERCHANT_WEBHOOK_TIMEOUT_MS;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let statusCode: number | null = null;
      let responseText: string | null = null;
      let success = false;

      try {
        const signature = createHmac("sha256", secret).update(body).digest("hex");

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-signature": signature,
            "x-delivery-id": deliveryId,
          },
          body,
          signal: controller.signal,
        });

        statusCode = res.status;
        responseText = await res.text().catch(() => null);
        success = res.ok;
      } catch (err: any) {
        responseText = err?.name === "AbortError"
          ? `Timeout after ${timeout}ms`
          : (err?.message ?? "Fetch failed");
      } finally {
        clearTimeout(timer);
      }

      // ── Atualizar ou criar log no banco ──────────────────────────
      const sanitizedResponse = sanitizeWebhookResponse(responseText);

      await prisma.webhookLog.upsert({
        where: { deliveryId },
        update: {
          statusCode,
          response: sanitizedResponse,
          attempts: attempt,
          success,
        },
        create: {
          deliveryId,
          event,
          url,
          payload,
          statusCode,
          response: sanitizedResponse,
          attempts: attempt,
          success,
          merchantId,
          webhookId,
        },
      });

      // Se não deu certo, lançar erro para o BullMQ agendar o retry
      if (!success) {
        const msg = `Webhook delivery failed | status: ${statusCode} | ${responseText?.slice(0, 200)}`;
        console.warn(`📤 [WEBHOOK-WORKER] ${msg}`);
        throw new Error(msg);
      }

      console.log(
        `📤 [WEBHOOK-WORKER] Entregue com sucesso | event: ${event} | status: ${statusCode} | deliveryId: ${deliveryId}`
      );
    },
    {
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 5,
      drainDelay: 30_000,
      stalledInterval: 120_000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", (job, err) => {
    if (job) {
      const remaining = (job.opts.attempts ?? 1) - job.attemptsMade;
      if (remaining > 0) {
        console.warn(
          `📤 [WEBHOOK-WORKER] Retry agendado | deliveryId: ${job.data.deliveryId} | restantes: ${remaining} | erro: ${err.message.slice(0, 150)}`
        );
      } else {
        console.error(
          `📤 [WEBHOOK-WORKER] Todas as tentativas falharam | deliveryId: ${job.data.deliveryId} | event: ${job.data.event} | url: ${job.data.url}`
        );
        captureError(err, { deliveryId: job.data.deliveryId, event: job.data.event, url: job.data.url, merchantId: job.data.merchantId });
      }
    }
  });

  worker.on("error", (err) => {
    console.error("📤 [WEBHOOK-WORKER] Erro no worker:", err.message);
  });

  console.log("📤 [WEBHOOK-WORKER] Worker iniciado (concurrency: 5)");

  return worker;
}
