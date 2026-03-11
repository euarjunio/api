import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";

export const adminErrorLogsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["Admin - Error Logs"],
        summary: "Listar logs de erros 5xx",
        description: "Retorna erros internos (5xx) capturados pela API, paginados e filtráveis.",
        querystring: z.object({
          status_code: z.coerce.number().int().optional(),
          route: z.string().optional().describe("Filtrar por rota parcial ex: /withdrawals"),
          from: z.string().optional().describe("Data inicial ISO 8601"),
          to: z.string().optional().describe("Data final ISO 8601"),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: {
          200: z.object({
            data: z.array(z.object({
              id: z.string(),
              statusCode: z.number(),
              message: z.string(),
              stack: z.string().nullable(),
              route: z.string().nullable(),
              requestId: z.string().nullable(),
              userId: z.string().nullable(),
              metadata: z.any().nullable(),
              createdAt: z.string().datetime(),
            })),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            pages: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { status_code, route, from, to, page, limit } = request.query;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status_code) where.statusCode = status_code;
      if (route) where.route = { contains: route, mode: "insensitive" };
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }

      const [data, total] = await Promise.all([
        prisma.errorLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.errorLog.count({ where }),
      ]);

      return reply.send({
        data: data.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    },
  );
};
