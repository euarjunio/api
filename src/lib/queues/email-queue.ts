import { Queue, Worker } from "bullmq";
import { env } from "../../config/env.ts";
import { sendEmail, type SendEmailOptions } from "../email.ts";

const QUEUE_NAME = "email-sending";

export const emailQueue = new Queue<SendEmailOptions>(QUEUE_NAME, {
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export function startEmailWorker() {
  const worker = new Worker<SendEmailOptions>(
    QUEUE_NAME,
    async (job) => {
      console.log(`📧 [EMAIL-WORKER] Sending to ${job.data.to}: ${job.data.subject}`);
      await sendEmail(job.data);
      console.log(`✅ [EMAIL-WORKER] Sent to ${job.data.to}`);
    },
    {
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 3,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`❌ [EMAIL-WORKER] Failed to send to ${job?.data.to}:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("❌ [EMAIL-WORKER] Erro no worker:", err.message);
  });

  console.log("📧 [EMAIL-WORKER] Worker iniciado (concurrency: 3)");

  return worker;
}

// Helper para enfileirar
export async function queueEmail(options: SendEmailOptions) {
  await emailQueue.add("send-email", options);
}
