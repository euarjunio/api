import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { invalidate, CacheKeys } from "../../lib/cache.ts";

export const notificationPreferencesRoute: FastifyPluginAsyncZod = async (app) => {
  // PATCH /v1/merchants/me/notifications
  app.patch("/me/notifications", {
    schema: {
      tags: ["Merchants"],
      summary: "Atualizar preferências de notificação",
      description: "Habilita ou desabilita o recebimento de emails para eventos como cobrança paga.",
      body: z.object({
        emailNotificationsEnabled: z.boolean(),
      }),
      response: {
        200: z.object({
          emailNotificationsEnabled: z.boolean(),
        }),
        404: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { emailNotificationsEnabled } = request.body;
    const { id } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({ where: { userId: id } });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    await prisma.merchant.update({
      where: { userId: id },
      data: { emailNotificationsEnabled },
    });

    // Invalidar cache do perfil
    await invalidate(CacheKeys.profile(id));

    return reply.status(200).send({ emailNotificationsEnabled });
  });
};
