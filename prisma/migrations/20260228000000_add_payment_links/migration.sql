-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'PAID', 'EXPIRED', 'DISABLED');

-- CreateTable
CREATE TABLE "payment_links" (
    "id"             TEXT NOT NULL,
    "slug"           TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "amount"         INTEGER NOT NULL,
    "description"    TEXT,
    "expires_at"     TIMESTAMP(3),
    "status"         "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "payment_method" TEXT NOT NULL DEFAULT 'PIX',
    "tracking"       JSONB,
    "paid_at"        TIMESTAMP(3),
    "charge_id"      TEXT,
    "merchant_id"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_slug_key" ON "payment_links"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_charge_id_key" ON "payment_links"("charge_id");

-- CreateIndex
CREATE INDEX "payment_links_merchant_id_status_idx" ON "payment_links"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "payment_links_slug_idx" ON "payment_links"("slug");

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
