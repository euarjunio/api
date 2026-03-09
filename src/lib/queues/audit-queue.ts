import { Worker } from "bullmq";
import { env } from "../../config/env.ts";
import { prisma } from "../prisma.ts";
import { captureError } from "../sentry.ts";

export function startAuditWorker() {
  const worker = new Worker(
    "audit-logs",
    async (job) => {
      const { action, actor, target, metadata, ip, userAgent } = job.data;

      await prisma.auditLog.create({
        data: {
          action,
          actor,
          target,
          metadata: metadata ?? undefined,
          ip,
          userAgent,
        },
      });
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
    console.error(`📋 [AUDIT-WORKER] Falhou: ${err.message}`);
    captureError(err, { queue: "audit-logs", jobId: job?.id });
  });

  worker.on("error", (err) => {
    console.error("📋 [AUDIT-WORKER] Worker error:", err.message);
  });

  console.log("📋 [AUDIT-WORKER] Worker iniciado (concurrency: 5)");
  return worker;
}
