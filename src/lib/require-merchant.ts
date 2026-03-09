import { prisma } from "./prisma.ts";
import { BadRequestError } from "../routes/errors/bad-request-error.ts";
import type { Prisma } from "./generated/prisma/client.ts";

export async function requireMerchant<T extends Prisma.MerchantSelect>(
  userId: string,
  select?: T,
) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId },
    ...(select ? { select } : {}),
  });

  if (!merchant) {
    throw new BadRequestError("Merchant não encontrado", 404);
  }

  return merchant;
}
