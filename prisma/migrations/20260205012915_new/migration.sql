/*
  Warnings:

  - You are about to drop the column `externalId` on the `charges` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `charges` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "charges_externalId_key";

-- AlterTable
ALTER TABLE "charges" DROP COLUMN "externalId",
DROP COLUMN "type";
