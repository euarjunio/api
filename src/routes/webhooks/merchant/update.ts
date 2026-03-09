import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { WEBHOOK_EVENT_NAMES } from "./events.ts";
import { isPrivateUrl } from "../../../utils/validate-url.ts";

export const updateMerchantWebhookRoute: FastifyPluginAsyncZod = async (app) => {
  // PATCH /v1/webhooks/merchant/:id
  app.patch("/:id", {
    schema: {
      tags: ["Webhooks"],
      summary: "Atualizar webhook",
      description:
        "Atualiza URL, nome, eventos ou status de um webhook específico. Envie apenas os campos que deseja alterar.",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        url: z.url("URL inválida").refine((u) => !isPrivateUrl(u), {
          message: "URLs privadas/internas não são permitidas",
        }).optional(),
        name: z.string().max(100).nullable().optional(),
        events: z.array(z.string()).optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      }),
      response: {
        200: z.object({
          webhook: z.object({
            id: z.string(),
            name: z.string().nullable(),
            url: z.string(),
            events: z.array(z.string()),
            status: z.string(),
            createdAt: z.string().datetime(),
            updatedAt: z.string().datetime(),
          }),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { id: webhookId } = request.params;
    const { url, name, events, status } = request.body;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    // Verificar se o webhook pertence ao merchant
    const existing = await prisma.merchantWebhook.findFirst({
      where: { id: webhookId, merchantId: merchant.id },
    });

    if (!existing) {
      return reply.status(404).send({ message: "Webhook não encontrado" });
    }

    // Validar eventos
    if (events && events.length > 0) {
      const invalid = events.filter((e) => !WEBHOOK_EVENT_NAMES.includes(e));
      if (invalid.length > 0) {
        return reply.status(400).send({
          message: `Eventos inválidos: ${invalid.join(", ")}. Use GET /v1/webhooks/merchant/events para ver a lista.`,
        });
      }
    }

    const updateData: Record<string, any> = {};
    if (url !== undefined) updateData.url = url;
    if (name !== undefined) updateData.name = name;
    if (events !== undefined) updateData.events = events;
    if (status !== undefined) updateData.status = status;

    const webhook = await prisma.merchantWebhook.update({
      where: { id: webhookId },
      data: updateData,
    });

    request.log.info(
      `[WEBHOOK] Merchant ${merchant.id} atualizou webhook ${webhookId}: ${JSON.stringify(updateData)}`,
    );

    return reply.status(200).send({
      webhook: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status,
        createdAt: webhook.createdAt.toISOString(),
        updatedAt: webhook.updatedAt.toISOString(),
      },
    });
  });
};
