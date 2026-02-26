import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";

export const trackingLogsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get("/logs", {
    schema: {
      tags: ["Tracking"],
      summary: "Listar histórico de ações dos plugins",
      description: "Retorna o histórico paginado de eventos disparados pelos plugins de tracking.",
      querystring: z.object({
        provider: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: {
        200: z.object({
          logs: z.array(z.object({
            id: z.string(),
            provider: z.string(),
            event: z.string(),
            status: z.string(),
            chargeId: z.string().nullable(),
            error: z.string().nullable(),
            createdAt: z.string().datetime(),
          })),
          pagination: z.object({
            page: z.number(),
            limit: z.number(),
            total: z.number(),
            totalPages: z.number(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { provider, page, limit } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const where: any = { merchantId: merchant.id };
    if (provider) where.provider = provider;

    const [logs, total] = await Promise.all([
      prisma.trackingLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trackingLog.count({ where }),
    ]);

    return reply.status(200).send({
      logs: logs.map((l) => ({
        id: l.id,
        provider: l.provider,
        event: l.event,
        status: l.status,
        chargeId: l.chargeId,
        error: l.error,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
};
