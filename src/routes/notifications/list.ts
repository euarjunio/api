import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";

export const listNotificationsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["Notifications"],
        summary: "Listar notificações do merchant",
        querystring: z.object({
          page: z.coerce.number().min(1).default(1),
          limit: z.coerce.number().min(1).max(50).default(20),
          unreadOnly: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
        }),
      },
    },
    async (request, reply) => {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      const { page, limit, unreadOnly } = request.query;
      const skip = (page - 1) * limit;

      const where = {
        merchantId: merchant.id,
        ...(unreadOnly ? { read: false } : {}),
      };

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.notification.count({ where }),
      ]);

      return reply.status(200).send({
        data: notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    },
  );
};
