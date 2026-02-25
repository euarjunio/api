import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "wh_****";
  return `wh_****${secret.slice(-4)}`;
}

export const getMerchantWebhookRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/webhooks/merchant
  app.get("/", {
    schema: {
      tags: ["Webhooks"],
      summary: "Listar webhooks do merchant",
      description:
        "Retorna todos os webhooks cadastrados e os últimos 20 logs de entrega por webhook.",
      response: {
        200: z.object({
          webhooks: z.array(
            z.object({
              id: z.string(),
              name: z.string().nullable(),
              url: z.string(),
              events: z.array(z.string()),
              secret: z.string(),
              status: z.string(),
              createdAt: z.string().datetime(),
              updatedAt: z.string().datetime(),
              logs: z.array(
                z.object({
                  id: z.string(),
                  deliveryId: z.string(),
                  event: z.string(),
                  url: z.string(),
                  payload: z.string(),
                  statusCode: z.number().nullable(),
                  response: z.string().nullable(),
                  attempts: z.number(),
                  success: z.boolean(),
                  createdAt: z.string().datetime(),
                }),
              ),
            }),
          ),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const webhooks = await prisma.merchantWebhook.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      include: {
        logs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            deliveryId: true,
            event: true,
            url: true,
            payload: true,
            statusCode: true,
            response: true,
            attempts: true,
            success: true,
            createdAt: true,
          },
        },
      },
    });

    return reply.status(200).send({
      webhooks: webhooks.map((wh) => ({
        id: wh.id,
        name: wh.name,
        url: wh.url,
        events: wh.events,
        secret: maskSecret(wh.secret),
        status: wh.status,
        createdAt: wh.createdAt.toISOString(),
        updatedAt: wh.updatedAt.toISOString(),
        logs: wh.logs.map((l) => ({
          id: l.id,
          deliveryId: l.deliveryId,
          event: l.event,
          url: l.url,
          payload: JSON.stringify(l.payload),
          statusCode: l.statusCode,
          response: l.response ?? null,
          attempts: l.attempts,
          success: l.success,
          createdAt: l.createdAt.toISOString(),
        })),
      })),
    });
  });
};
