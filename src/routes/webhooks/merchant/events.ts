import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Lista de todos os eventos disponíveis para webhooks.
 * Merchant pode selecionar quais quer receber.
 * Se nenhum for selecionado (array vazio), recebe todos (wildcard).
 */
export const WEBHOOK_EVENTS = [
  {
    event: "charge.paid",
    description: "Cobrança PIX paga pelo cliente",
    category: "Cobranças",
  },
  {
    event: "charge.refunded",
    description: "Cobrança PIX estornada",
    category: "Cobranças",
  },
  {
    event: "withdraw.completed",
    description: "Saque concluído com sucesso",
    category: "Saques",
  },
  {
    event: "withdraw.failed",
    description: "Saque falhou ou foi devolvido",
    category: "Saques",
  },
  {
    event: "withdraw.refunded",
    description: "Saque devolvido (refund de transferência)",
    category: "Saques",
  },
  {
    event: "pixkey.updated",
    description: "Chave PIX atualizada",
    category: "Chave PIX",
  },
  {
    event: "infraction.received",
    description: "Nova infração PIX (MED) recebida",
    category: "Infrações",
  },
  {
    event: "infraction.updated",
    description: "Infração PIX atualizada",
    category: "Infrações",
  },
  {
    event: "infraction.refund_completed",
    description: "Reembolso de infração concluído",
    category: "Infrações",
  },
] as const;

export const WEBHOOK_EVENT_NAMES: string[] = WEBHOOK_EVENTS.map((e) => e.event);

export const listWebhookEventsRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/webhooks/merchant/events
  app.get("/events", {
    schema: {
      tags: ["Webhooks"],
      summary: "Listar eventos disponíveis",
      description:
        "Retorna todos os eventos disponíveis para inscrição em webhooks. Se nenhum evento for selecionado ao criar um webhook, ele receberá todos os eventos (wildcard).",
      response: {
        200: z.object({
          events: z.array(
            z.object({
              event: z.string(),
              description: z.string(),
              category: z.string(),
            }),
          ),
        }),
      },
    },
  }, async (_request, reply) => {
    return reply.status(200).send({ events: [...WEBHOOK_EVENTS] });
  });
};
