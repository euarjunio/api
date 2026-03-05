-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "daily_withdraw_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_withdraw_amount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pending_webhooks" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "object" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_webhooks_event_id_key" ON "pending_webhooks"("event_id");

-- CreateIndex
CREATE INDEX "pending_webhooks_status_createdAt_idx" ON "pending_webhooks"("status", "createdAt");
