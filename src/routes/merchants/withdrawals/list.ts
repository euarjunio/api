import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { getOrSet, CacheKeys, CacheTTL } from "../../../lib/cache.ts";

export const listWithdrawalsRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/withdrawals
  app.get("/", {
    schema: {
      tags: ["Withdrawals"],
      summary: "Listar saques",
      description: "Lista os saques solicitados pelo merchant com paginação.",
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          withdrawals: z.array(z.object({
            id: z.string(),
            amount: z.number(),
            description: z.string().nullable(),
            status: z.string(),
            batchId: z.string().nullable(),
            pixKey: z.string().nullable(),
            pixKeyType: z.string().nullable(),
            createdAt: z.string().datetime(),
          })),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { page, limit } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const cached = await getOrSet(
      CacheKeys.withdrawals(merchant.id, page, limit),
      CacheTTL.withdrawals,
      async () => {
        const where = {
          merchantId: merchant.id,
          type: "WITHDRAW" as const,
        };

        const [total, withdrawals] = await Promise.all([
          prisma.ledger.count({ where }),
          prisma.ledger.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]);

        return {
          total,
          withdrawals: withdrawals.map((w) => {
            const meta = (w.metadata as Record<string, any>) ?? {};
            return {
              id: w.id,
              amount: Math.abs(w.amount),
              description: w.description,
              status: meta.withdrawStatus ?? "UNKNOWN",
              batchId: meta.batchId != null ? String(meta.batchId) : null,
              pixKey: meta.pixKey ?? null,
              pixKeyType: meta.pixKeyType ?? null,
              createdAt: w.createdAt.toISOString(),
            };
          }),
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
