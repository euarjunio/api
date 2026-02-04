/*
  Warnings:

  - You are about to drop the column `pixCode` on the `charges` table. All the data in the column will be lost.
  - You are about to drop the column `provider` on the `charges` table. All the data in the column will be lost.
  - You are about to drop the column `provider_charge_id` on the `charges` table. All the data in the column will be lost.
  - You are about to drop the column `provider_raw` on the `charges` table. All the data in the column will be lost.
  - Made the column `qrCode` on table `charges` required. This step will fail if there are existing NULL values in that column.
  - Made the column `expiresIn` on table `charges` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "charges" DROP COLUMN "pixCode",
DROP COLUMN "provider",
DROP COLUMN "provider_charge_id",
DROP COLUMN "provider_raw",
ALTER COLUMN "qrCode" SET NOT NULL,
ALTER COLUMN "expiresIn" SET NOT NULL;

-- DropEnum
DROP TYPE "AcquirerProvider";
