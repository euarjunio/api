import client from "prom-client";
import type { Queue } from "bullmq";

export const register = client.register;

client.collectDefaultMetrics({ register });

// ── HTTP Request Duration (histograma por rota) ──────────────────────
export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duracao dos requests HTTP em segundos",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// ── HTTP Requests Total (contador por rota) ──────────────────────────
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total de requests HTTP",
  labelNames: ["method", "route", "status"] as const,
});

// ── BullMQ Queue Gauges ──────────────────────────────────────────────
export const bullmqQueueSize = new client.Gauge({
  name: "bullmq_queue_size",
  help: "Tamanho das filas BullMQ",
  labelNames: ["queue", "state"] as const,
});

// ── BullMQ Queue Registry ────────────────────────────────────────────
const registeredQueues: Queue[] = [];

export function registerBullMQQueue(queue: Queue): void {
  registeredQueues.push(queue);
}

export async function collectBullMQMetrics(): Promise<void> {
  for (const queue of registeredQueues) {
    try {
      const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      for (const [state, count] of Object.entries(counts)) {
        bullmqQueueSize.set({ queue: queue.name, state }, count as number);
      }
    } catch {
      // Queue might be disconnected — skip silently
    }
  }
}
