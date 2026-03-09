-- AlterTable
ALTER TABLE "merchants" ALTER COLUMN "fee_amount" SET DEFAULT 70;
ALTER TABLE "merchants" ALTER COLUMN "withdraw_fee" SET DEFAULT 500;
ALTER TABLE "merchants" ALTER COLUMN "max_withdraw_amount" SET DEFAULT 500000;
ALTER TABLE "merchants" ALTER COLUMN "daily_withdraw_limit" SET DEFAULT 500000;
ALTER TABLE "merchants" ALTER COLUMN "monthly_withdraw_limit" SET DEFAULT 40000000;
ALTER TABLE "merchants" ALTER COLUMN "night_withdraw_limit" SET DEFAULT 100000;
ALTER TABLE "merchants" ALTER COLUMN "min_ticket_amount" SET DEFAULT 100;
ALTER TABLE "merchants" ALTER COLUMN "max_ticket_amount" SET DEFAULT 12000;
