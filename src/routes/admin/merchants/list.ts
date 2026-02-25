import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const listMerchantsRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/admin/merchants
  app.get("/", {
    schema: {
      tags: ["Admin"],
      summary: "Listar todos os merchants",
      description: "Retorna todos os merchants com filtros opcionais de status e KYC.",
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        kycStatus: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"]).optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        search: z.string().max(100).optional(),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          merchants: z.array(z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            document: z.string(),
            documentType: z.string(),
            status: z.string(),
            kycStatus: z.string(),
            feeMode: z.string(),
            feeAmount: z.number(),
            pixKey: z.string().nullable(),
            acquirer: z.string(),
            acquirerAccountId: z.string().nullable(),
            createdAt: z.string().datetime(),
          })),
        }),
      },
    },
  }, async (request, reply) => {
    const { page, limit, kycStatus, status, search } = request.query;

    const where: any = {};
    if (kycStatus) where.kycStatus = kycStatus;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { document: { contains: search } },
      ];
    }

    const [total, merchants] = await Promise.all([
      prisma.merchant.count({ where }),
      prisma.merchant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return reply.status(200).send({
      page,
      limit,
      total,
      merchants: merchants.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        document: m.document,
        documentType: m.documentType,
        status: m.status,
        kycStatus: m.kycStatus,
        feeMode: m.feeMode,
        feeAmount: m.feeAmount,
        pixKey: m.pixKey,
        acquirer: m.acquirer,
        acquirerAccountId: m.acquirerAccountId,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });
};
