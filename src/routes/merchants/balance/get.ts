import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { getOrSet, CacheKeys, CacheTTL } from "../../../lib/cache.ts";

export const getBalanceRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/balance
  app.get("/", {
    schema: {
      tags: ["Balance"],
      summary: "Consultar saldo",
      description: "Retorna o saldo do merchant dividido em pendente, disponível e bloqueado (valores em centavos).",
      response: {
        200: z.object({
          balance: z.object({
            pending: z.number(),
            available: z.number(),
            blocked: z.number(),
            total: z.number(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const balance = await getOrSet(
      CacheKeys.balance(merchant.id),
      CacheTTL.balance,
      () => ledgerService.getBalance(merchant.id),
    );

    return reply.status(200).send({ balance });
  });
};
