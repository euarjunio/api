import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";

export const markReadRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    "/:id/read",
    {
      schema: {
        tags: ["Notifications"],
        summary: "Marcar notificação como lida",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      await prisma.notification.updateMany({
        where: { id, merchantId: merchant.id },
        data: { read: true, readAt: new Date() },
      });

      return reply.status(200).send({ message: "Notificação marcada como lida" });
    },
  );
};
