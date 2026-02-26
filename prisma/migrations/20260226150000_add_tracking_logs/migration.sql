-- CreateTable
CREATE TABLE "tracking_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "charge_id" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchant_id" TEXT NOT NULL,
    "tracking_id" TEXT,

    CONSTRAINT "tracking_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_logs_merchant_id_createdAt_idx" ON "tracking_logs"("merchant_id", "createdAt");

-- CreateIndex
CREATE INDEX "tracking_logs_merchant_id_provider_idx" ON "tracking_logs"("merchant_id", "provider");

-- AddForeignKey
ALTER TABLE "tracking_logs" ADD CONSTRAINT "tracking_logs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_logs" ADD CONSTRAINT "tracking_logs_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "merchant_trackings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
