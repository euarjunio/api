import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

const withdrawStatusValues = ["REQUESTED", "PROCESSING", "COMPLETED", "FAILED"] as const;

export const adminListWithdrawalsRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/admin/merchants/:id/withdrawals
  app.get("/:id/withdrawals", {
    schema: {
      tags: ["Admin"],
      summary: "Listar saques de um merchant",
      description: "Retorna os saques de um merchant específico com paginação e filtros.",
      params: z.object({ id: z.uuid() }),
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        status: z.enum(withdrawStatusValues).optional(),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          withdrawals: z.array(z.object({
            id: z.string(),
            amount: z.number(),
            pixKey: z.string().nullable(),
            pixKeyType: z.string().nullable(),
            status: z.string(),
            batchId: z.string().nullable(),
            createdAt: z.string().datetime(),
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

    const allWithdrawals = await prisma.ledger.findMany({
      where: {
        merchantId: id,
        type: "WITHDRAW",
      },
      orderBy: { createdAt: "desc" },
    });

    const mapped = allWithdrawals.map((entry) => {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      return {
        id: entry.id,
        amount: Math.abs(entry.amount),
        pixKey: (meta.pixKey as string) ?? null,
        pixKeyType: (meta.pixKeyType as string) ?? null,
        status: (meta.withdrawStatus as string) ?? "REQUESTED",
        batchId: (meta.batchId as string) ?? null,
        createdAt: entry.createdAt.toISOString(),
      };
    });

    const filtered = status ? mapped.filter((w) => w.status === status) : mapped;
    const total = filtered.length;
    const withdrawals = filtered.slice((page - 1) * limit, page * limit);

    return reply.status(200).send({ page, limit, total, withdrawals });
  });
};
