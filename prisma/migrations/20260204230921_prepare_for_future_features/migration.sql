-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChargeStatus" ADD VALUE 'CANCELED';
ALTER TYPE "ChargeStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "charges" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "metadata" JSONB;
