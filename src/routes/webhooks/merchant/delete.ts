import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";

export const deleteMerchantWebhookRoute: FastifyPluginAsyncZod = async (app) => {
  // DELETE /v1/webhooks/merchant/:id
  app.delete("/:id", {
    schema: {
      tags: ["Webhooks"],
      summary: "Remover webhook",
      description:
        "Remove um webhook específico. As notificações para essa URL deixarão de ser enviadas.",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { id: webhookId } = request.params;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    // Verificar se o webhook pertence ao merchant
    const webhook = await prisma.merchantWebhook.findFirst({
      where: { id: webhookId, merchantId: merchant.id },
    });

    if (!webhook) {
      return reply.status(404).send({ message: "Webhook não encontrado" });
    }

    await prisma.merchantWebhook.delete({
      where: { id: webhookId },
    });

    request.log.info(`[WEBHOOK] Merchant ${merchant.id} removeu webhook ${webhookId}: ${webhook.url}`);

    return reply.status(200).send({ message: "Webhook removido com sucesso" });
  });
};
