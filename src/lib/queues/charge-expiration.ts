import { Queue, Worker } from "bullmq";
import { env } from "../../config/env.ts";
import { prisma } from "../prisma.ts";
import { captureError } from "../sentry.ts";

export const chargeExpirationQueue = new Queue("charge-expiration", {
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
});

export function startChargeExpirationWorker() {
  const worker = new Worker(
    "charge-expiration",
    async () => {
      const now = new Date();

      const result = await prisma.charges.updateMany({
        where: {
          status: "PENDING",
          createdAt: {
            lt: new Date(now.getTime() - 86400 * 1000),
          },
        },
        data: { status: "CANCELED", canceledAt: now },
      });

      if (result.count > 0) {
        console.log(
          `⏰ [EXPIRATION] ${result.count} cobranças expiradas marcadas como CANCELED`,
        );
      }
    },
    {
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 1,
      drainDelay: 30_000,
      stalledInterval: 120_000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`⏰ [EXPIRATION] Job falhou: ${err.message}`);
    captureError(err, { queue: "charge-expiration" });
  });

  worker.on("error", (err) => {
    console.error("⏰ [EXPIRATION] Worker error:", err.message);
  });

  // Schedule repeatable job every 15 minutes
  chargeExpirationQueue.upsertJobScheduler(
    "expire-pending-charges",
    { every: 15 * 60 * 1000 },
    { name: "expire-charges" },
  );

  console.log("⏰ [EXPIRATION] Worker iniciado (a cada 15 min)");
  return worker;
}
