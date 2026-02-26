-- AlterTable: add tracking column to charges
ALTER TABLE "charges" ADD COLUMN "tracking" JSONB;

-- CreateTable: merchant_trackings
CREATE TABLE "merchant_trackings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "merchant_id" TEXT NOT NULL,

    CONSTRAINT "merchant_trackings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_trackings_merchant_id_provider_key" ON "merchant_trackings"("merchant_id", "provider");

-- CreateIndex
CREATE INDEX "merchant_trackings_merchant_id_enabled_idx" ON "merchant_trackings"("merchant_id", "enabled");

-- AddForeignKey
ALTER TABLE "merchant_trackings" ADD CONSTRAINT "merchant_trackings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
