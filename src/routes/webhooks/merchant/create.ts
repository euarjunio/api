import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import crypto from "node:crypto";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { WEBHOOK_EVENT_NAMES } from "./events.ts";

function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const createMerchantWebhookRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/webhooks/merchant
  app.post("/", {
    schema: {
      tags: ["Webhooks"],
      summary: "Criar webhook",
      description:
        "Cria um novo webhook para o merchant. Cada webhook pode escutar eventos específicos. Se nenhum evento for selecionado, o webhook receberá todos os eventos (wildcard). O secret é retornado apenas na criação — guarde-o.",
      body: z.object({
        url: z.url("URL inválida"),
        name: z.string().max(100).optional(),
        events: z.array(z.string()).default([]),
      }),
      response: {
        201: z.object({
          webhook: z.object({
            id: z.string(),
            name: z.string().nullable(),
            url: z.string(),
            events: z.array(z.string()),
            secret: z.string(),
            status: z.string(),
            createdAt: z.string().datetime(),
          }),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { url, name, events } = request.body;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    // Validar se os eventos informados existem
    if (events.length > 0) {
      const invalid = events.filter((e) => !WEBHOOK_EVENT_NAMES.includes(e));
      if (invalid.length > 0) {
        return reply.status(400).send({
          message: `Eventos inválidos: ${invalid.join(", ")}. Use GET /v1/webhooks/merchant/events para ver a lista.`,
        });
      }
    }

    const secret = generateWebhookSecret();

    const webhook = await prisma.merchantWebhook.create({
      data: {
        url,
        name: name ?? null,
        events,
        secret,
        status: "ACTIVE",
        merchantId: merchant.id,
      },
    });

    request.log.info(
      `[WEBHOOK] Merchant ${merchant.id} criou webhook: ${url} | events: ${events.length === 0 ? "*" : events.join(", ")}`,
    );

    return reply.status(201).send({
      webhook: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret,
        status: webhook.status,
        createdAt: webhook.createdAt.toISOString(),
      },
    });
  });
};
