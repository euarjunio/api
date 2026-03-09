-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "monthly_withdraw_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "merchants" ADD COLUMN "night_withdraw_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "merchants" ADD COLUMN "min_ticket_amount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "merchants" ADD COLUMN "max_ticket_amount" INTEGER NOT NULL DEFAULT 0;
