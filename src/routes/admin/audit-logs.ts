import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { verifyAdmin } from "../hooks/verify-admin.ts";

export const adminAuditLogsRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyAdmin);

  // GET /v1/admin/audit-logs
  app.get("/", {
    schema: {
      tags: ["Admin / Audit"],
      summary: "Listar audit logs",
      description:
        "Retorna registros de auditoria com filtros opcionais por ação, ator, alvo e período.",
      querystring: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        action: z.string().optional(),
        actor: z.string().optional(),
        target: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
      response: {
        200: z.object({
          logs: z.array(
            z.object({
              id: z.string(),
              action: z.string(),
              actor: z.string(),
              target: z.string().nullable(),
              metadata: z.any().nullable(),
              ip: z.string().nullable(),
              userAgent: z.string().nullable(),
              createdAt: z.string().datetime(),
            }),
          ),
          pagination: z.object({
            page: z.number(),
            limit: z.number(),
            total: z.number(),
            totalPages: z.number(),
          }),
        }),
      },
    },
  }, async (request, reply) => {
    const { page, limit, action, actor, target, from, to } = request.query;

    const where: Record<string, any> = {};

    if (action) where.action = action;
    if (actor) where.actor = { contains: actor };
    if (target) where.target = target;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.status(200).send({
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        actor: log.actor,
        target: log.target,
        metadata: log.metadata,
        ip: log.ip,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString(),
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
