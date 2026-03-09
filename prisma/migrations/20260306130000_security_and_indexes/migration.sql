-- ═══════════════════════════════════════════════════════════
-- 1. API Key Hashing (SHA-256)
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "apikeys" ADD COLUMN "key_hash" TEXT;
ALTER TABLE "apikeys" ADD COLUMN "key_prefix" TEXT NOT NULL DEFAULT '';

-- Hash existing plain-text keys
UPDATE "apikeys" SET
  "key_hash" = encode(digest("value", 'sha256'), 'hex'),
  "key_prefix" = LEFT("value", 7) || '****' || RIGHT("value", 4);

ALTER TABLE "apikeys" ALTER COLUMN "key_hash" SET NOT NULL;
CREATE UNIQUE INDEX "apikeys_key_hash_key" ON "apikeys"("key_hash");

-- Drop old value column
DROP INDEX IF EXISTS "apikeys_value_key";
ALTER TABLE "apikeys" DROP COLUMN "value";

-- ═══════════════════════════════════════════════════════════
-- 2. Customer Scoping by Merchant
-- ═══════════════════════════════════════════════════════════

ALTER TABLE "customers" ADD COLUMN "merchant_id" TEXT;

-- Populate merchantId from existing charge relationships
UPDATE "customers" c SET "merchant_id" = sub.merchant_id
FROM (
  SELECT DISTINCT ON (ch."customerId")
    ch."customerId" AS customer_id,
    ch."merchantId" AS merchant_id
  FROM "charges" ch
  WHERE ch."customerId" IS NOT NULL
  ORDER BY ch."customerId", ch."createdAt" DESC
) sub
WHERE c."id" = sub.customer_id;

-- Remove old global unique constraints
DROP INDEX IF EXISTS "customers_email_key";
DROP INDEX IF EXISTS "customers_document_key";

-- Composite unique: same document per merchant is unique
CREATE UNIQUE INDEX "customers_merchant_id_document_key" ON "customers"("merchant_id", "document");

ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "customers_merchant_id_idx" ON "customers"("merchant_id");

-- ═══════════════════════════════════════════════════════════
-- 3. GIN Index for JSON path queries (charges.metadata)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX "charges_metadata_gin_idx" ON "charges" USING GIN ("metadata" jsonb_path_ops);

-- ═══════════════════════════════════════════════════════════
-- 4. Trigram indexes for audit log text search
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "audit_logs_action_trgm_idx" ON "audit_logs" USING GIN ("action" gin_trgm_ops);
CREATE INDEX "audit_logs_actor_trgm_idx" ON "audit_logs" USING GIN ("actor" gin_trgm_ops);
