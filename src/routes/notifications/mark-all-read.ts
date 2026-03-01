import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { prisma } from "../../lib/prisma.ts";

export const markAllReadRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    "/read-all",
    {
      schema: {
        tags: ["Notifications"],
        summary: "Marcar todas as notificações como lidas",
      },
    },
    async (request, reply) => {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      await prisma.notification.updateMany({
        where: { merchantId: merchant.id, read: false },
        data: { read: true, readAt: new Date() },
      });

      return reply.status(200).send({ message: "Todas as notificações marcadas como lidas" });
    },
  );
};
