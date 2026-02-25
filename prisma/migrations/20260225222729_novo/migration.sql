-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FeeMode" AS ENUM ('PERCENTUAL', 'FIXADO');

-- CreateEnum
CREATE TYPE "MerchantWebhookStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('CASH_IN', 'FEE', 'WITHDRAW', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'AVAILABLE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InfractionStatus" AS ENUM ('PENDING', 'AGREED', 'DISAGREED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InfractionAnalysisStatus" AS ENUM ('PENDING', 'AWAITING_APPROVAL', 'ACCEPTED', 'REJECTED', 'DELAYED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InfractionSituationType" AS ENUM ('SCAM', 'ACCOUNT_TAKEOVER', 'COERCION', 'FRAUDULENT_ACCESS', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REFUND_PENDING', 'REFUND_CLOSED', 'REFUND_CANCELED');

-- CreateEnum
CREATE TYPE "RefundAnalysisStatus" AS ENUM ('TOTALLY_ACCEPTED', 'PARTIALLY_ACCEPTED', 'REFUND_REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'CNPJ',
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "doc_front_url" TEXT,
    "doc_back_url" TEXT,
    "doc_selfie_url" TEXT,
    "kyc_notes" TEXT,
    "kyc_analyzed_at" TIMESTAMP(3),
    "acquirer" TEXT NOT NULL DEFAULT 'transfeera',
    "acquirer_account_id" TEXT,
    "pix_key_id" TEXT,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "pix_key_status" TEXT,
    "fee_mode" "FeeMode" NOT NULL DEFAULT 'FIXADO',
    "fee_amount" INTEGER NOT NULL DEFAULT 80,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "document" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "acquirer" TEXT NOT NULL DEFAULT 'transfeera',
    "payment_method" TEXT NOT NULL DEFAULT 'PIX',
    "txid" TEXT,
    "qr_code" TEXT,
    "expires_in" INTEGER NOT NULL DEFAULT 86400,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apikeys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT NOT NULL,

    CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "LedgerType" NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "merchant_id" TEXT NOT NULL,
    "charge_id" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "url" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MerchantWebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "secret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT NOT NULL,

    CONSTRAINT "merchant_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "merchant_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "webhook_id" TEXT NOT NULL,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infractions" (
    "id" TEXT NOT NULL,
    "acquirer" TEXT NOT NULL DEFAULT 'transfeera',
    "acquirer_infraction_id" TEXT NOT NULL,
    "acquirer_event_id" TEXT,
    "acquirer_account_id" TEXT,
    "status" "InfractionStatus" NOT NULL DEFAULT 'PENDING',
    "analysis_status" "InfractionAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "situation_type" "InfractionSituationType" NOT NULL,
    "transaction_id" TEXT,
    "txid" TEXT,
    "amount" INTEGER NOT NULL,
    "infraction_date" TIMESTAMP(3) NOT NULL,
    "analysis_due_date" TIMESTAMP(3),
    "analysis_date" TIMESTAMP(3),
    "infraction_description" TEXT,
    "payer_name" TEXT,
    "payer_tax_id" TEXT,
    "contested_at" TIMESTAMP(3),
    "merchant_analysis" TEXT,
    "merchant_description" TEXT,
    "merchant_analyzed_at" TIMESTAMP(3),
    "admin_approved_by" TEXT,
    "admin_notes" TEXT,
    "admin_approved_at" TIMESTAMP(3),
    "sent_analysis" TEXT,
    "sent_description" TEXT,
    "sent_at" TIMESTAMP(3),
    "refund_status" "RefundStatus",
    "refund_analysis_status" "RefundAnalysisStatus",
    "refund_transaction_id" TEXT,
    "refunded_amount" INTEGER,
    "refund_date" TIMESTAMP(3),
    "refund_rejection_reason" TEXT,
    "reviewer_name" TEXT,
    "merchant_id" TEXT NOT NULL,
    "charge_id" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "infractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_document_key" ON "merchants"("document");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_acquirer_account_id_key" ON "merchants"("acquirer_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_pix_key_id_key" ON "merchants"("pix_key_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_userId_key" ON "merchants"("userId");

-- CreateIndex
CREATE INDEX "merchants_userId_idx" ON "merchants"("userId");

-- CreateIndex
CREATE INDEX "merchants_kyc_status_idx" ON "merchants"("kyc_status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_document_key" ON "customers"("document");

-- CreateIndex
CREATE INDEX "customers_document_idx" ON "customers"("document");

-- CreateIndex
CREATE UNIQUE INDEX "charges_txid_key" ON "charges"("txid");

-- CreateIndex
CREATE INDEX "charges_merchantId_status_idx" ON "charges"("merchantId", "status");

-- CreateIndex
CREATE INDEX "charges_txid_idx" ON "charges"("txid");

-- CreateIndex
CREATE UNIQUE INDEX "charges_merchantId_idempotency_key_key" ON "charges"("merchantId", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "apikeys_value_key" ON "apikeys"("value");

-- CreateIndex
CREATE INDEX "apikeys_merchantId_idx" ON "apikeys"("merchantId");

-- CreateIndex
CREATE INDEX "ledger_merchant_id_status_idx" ON "ledger"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "ledger_merchant_id_type_idx" ON "ledger"("merchant_id", "type");

-- CreateIndex
CREATE INDEX "ledger_charge_id_idx" ON "ledger"("charge_id");

-- CreateIndex
CREATE INDEX "merchant_webhooks_merchantId_status_idx" ON "merchant_webhooks"("merchantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_logs_delivery_id_key" ON "webhook_logs"("delivery_id");

-- CreateIndex
CREATE INDEX "webhook_logs_merchant_id_createdAt_idx" ON "webhook_logs"("merchant_id", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_logs_webhook_id_idx" ON "webhook_logs"("webhook_id");

-- CreateIndex
CREATE UNIQUE INDEX "infractions_acquirer_infraction_id_key" ON "infractions"("acquirer_infraction_id");

-- CreateIndex
CREATE INDEX "infractions_merchant_id_status_idx" ON "infractions"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "infractions_merchant_id_analysis_status_idx" ON "infractions"("merchant_id", "analysis_status");

-- CreateIndex
CREATE INDEX "infractions_txid_idx" ON "infractions"("txid");

-- CreateIndex
CREATE INDEX "infractions_transaction_id_idx" ON "infractions"("transaction_id");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_webhooks" ADD CONSTRAINT "merchant_webhooks_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "merchant_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
