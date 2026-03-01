-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CHARGE_PAID', 'CHARGE_REFUNDED', 'WITHDRAW_COMPLETED', 'WITHDRAW_FAILED', 'INFRACTION_RECEIVED', 'PIX_KEY_UPDATED', 'SYSTEM');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "merchant_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_merchant_id_read_createdAt_idx" ON "notifications"("merchant_id", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
