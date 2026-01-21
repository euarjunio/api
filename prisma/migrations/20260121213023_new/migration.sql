/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `merchants` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `merchants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "apikeys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT NOT NULL,

    CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apikeys_value_key" ON "apikeys"("value");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_userId_key" ON "merchants"("userId");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
