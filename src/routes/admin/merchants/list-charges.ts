import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const adminListChargesRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/admin/merchants/:id/charges
  app.get("/:id/charges", {
    schema: {
      tags: ["Admin"],
      summary: "Listar cobranças de um merchant",
      description: "Retorna as cobranças de um merchant específico com paginação e filtros.",
      params: z.object({ id: z.uuid() }),
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        status: z.enum(["PENDING", "PAID", "FAILED", "CANCELED", "REFUNDED"]).optional(),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          charges: z.array(z.object({
            id: z.string(),
            txid: z.string().nullable(),
            amount: z.number(),
            description: z.string(),
            status: z.string(),
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
    const { id } = request.params;
    const { page, limit, status } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const where = {
      merchantId: id,
      ...(status ? { status } : {}),
    } as const;

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

    return reply.status(200).send({
      page,
      limit,
      total,
      charges: charges.map((c) => ({
        id: c.id,
        txid: c.txid,
        amount: c.amount,
        description: c.description,
        status: c.status,
        paidAt: c.paidAt ? c.paidAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        customer: c.customer ?? null,
      })),
    });
  });
};
