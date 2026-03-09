-- CreateIndex
CREATE INDEX "charges_customerId_idx" ON "charges"("customerId");

-- CreateIndex
CREATE INDEX "charges_merchantId_createdAt_idx" ON "charges"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "charges_merchantId_status_createdAt_idx" ON "charges"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "charges_status_idx" ON "charges"("status");

-- CreateIndex
CREATE INDEX "charges_status_paidAt_idx" ON "charges"("status", "paidAt");

-- CreateIndex
CREATE INDEX "charges_createdAt_idx" ON "charges"("createdAt");

-- CreateIndex
CREATE INDEX "infractions_merchant_id_createdAt_idx" ON "infractions"("merchant_id", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_merchant_id_type_createdAt_idx" ON "ledger"("merchant_id", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_type_idx" ON "ledger"("type");

-- CreateIndex
CREATE INDEX "merchants_status_kyc_status_idx" ON "merchants"("status", "kyc_status");

-- CreateIndex
CREATE INDEX "merchants_createdAt_idx" ON "merchants"("createdAt");
