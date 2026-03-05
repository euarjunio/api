import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { getOrSet, CacheKeys, CacheTTL } from "../../../lib/cache.ts";

export const listTransactionsRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/balance/transactions
  app.get("/transactions", {
    schema: {
      tags: ["Balance"],
      summary: "Extrato de transações",
      description: "Lista as transações financeiras do merchant com paginação e filtros.",
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        type: z.enum(["CASH_IN", "FEE", "WITHDRAW", "REFUND", "ADJUSTMENT"]).optional(),
        status: z.enum(["PENDING", "AVAILABLE", "BLOCKED"]).optional(),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          transactions: z.array(z.object({
            id: z.string(),
            amount: z.number(),
            type: z.string(),
            status: z.string(),
            description: z.string().nullable(),
            chargeId: z.string().nullable(),
            feeAmount: z.number().nullable(),
            netAmount: z.number().nullable(),
            createdAt: z.string().datetime(),
          })),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { page, limit, type, status } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const cached = await getOrSet(
      CacheKeys.transactions(merchant.id, page, limit, type, status),
      CacheTTL.transactions,
      async () => {
        const result = await ledgerService.getTransactions(merchant.id, { page, limit, type, status });
        return {
          total: result.total,
          transactions: result.transactions.map((t) => ({
            id: t.id,
            amount: t.amount,
            type: t.type,
            status: t.status,
            description: t.description,
            chargeId: t.chargeId,
            feeAmount: t.feeAmount,
            netAmount: t.netAmount,
            createdAt: t.createdAt.toISOString(),
          })),
        };
      },
    );

    return reply.status(200).send({
      page,
      limit,
      ...cached,
    });
  });
};
