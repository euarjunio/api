import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { authenticate } from "../hooks/authenticate.ts";
import { getOrSet, CacheKeys, CacheTTL } from "../../lib/cache.ts";

export const listChargesRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate).get("/", {
    schema: {
      tags: ["Charges"],
      summary: "Listar cobranças PIX",
      description: "Lista as cobranças do merchant autenticado",
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        status: z.enum(["PENDING", "PAID", "FAILED", "CANCELED", "REFUNDED"]).optional(),
        startDate: z.string().datetime({ offset: true }).optional(),
        endDate: z.string().datetime({ offset: true }).optional(),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          charges: z.array(z.object({
            id: z.string(),
            txid: z.string().nullable(),
            qrCode: z.string().nullable(),
            amount: z.number(),
            description: z.string(),
            status: z.string(),
            expiresIn: z.number(),
            paidAt: z.string().datetime().nullable(),
            createdAt: z.string().datetime(),
            customer: z.object({
              id: z.string(),
              name: z.string(),
              document: z.string(),
            }).nullable(),
          })),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { page, limit, status, startDate, endDate } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const cached = await getOrSet(
      CacheKeys.charges(merchant.id, page, limit, status, startDate, endDate),
      CacheTTL.charges,
      async () => {
        const where = {
          merchantId: merchant.id,
          ...(status ? { status } : {}),
          ...(startDate || endDate
            ? {
                createdAt: {
                  ...(startDate ? { gte: new Date(startDate) } : {}),
                  ...(endDate ? { lte: new Date(endDate) } : {}),
                },
              }
            : {}),
        };

        const [total, charges] = await Promise.all([
          prisma.charges.count({ where }),
          prisma.charges.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            include: {
              customer: { select: { id: true, name: true, document: true } },
            },
          }),
        ]);

        return {
          total,
          charges: charges.map((c) => ({
            id: c.id,
            txid: c.txid,
            qrCode: c.qrCode,
            amount: c.amount,
            description: c.description,
            status: c.status,
            expiresIn: c.expiresIn,
            paidAt: c.paidAt ? c.paidAt.toISOString() : null,
            createdAt: c.createdAt.toISOString(),
            customer: c.customer ?? null,
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
