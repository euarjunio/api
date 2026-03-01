import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";

export const unreadCountRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/unread-count",
    {
      schema: {
        tags: ["Notifications"],
        summary: "Contagem de notificações não lidas",
        response: {
          200: z.object({ count: z.number() }),
        },
      },
    },
    async (request, reply) => {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
      });

      if (!merchant) return reply.status(200).send({ count: 0 });

      const count = await prisma.notification.count({
        where: { merchantId: merchant.id, read: false },
      });

      return reply.status(200).send({ count });
    },
  );
};
