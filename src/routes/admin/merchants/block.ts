import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { logAction, getRequestContext } from "../../../lib/audit.ts";
import { blockMerchant } from "../../../services/merchant.service.ts";

export const blockMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/:id/block", {
    schema: {
      tags: ["Admin"],
      summary: "Bloquear merchant",
      description: "Desativa o merchant. Impede criação de cobranças e saques.",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        reason: z.string().min(3, "Motivo deve ter pelo menos 3 caracteres"),
      }),
      response: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;

    const result = await blockMerchant(id, reason);
    if (!result.ok) {
      return reply.status(result.status).send({ message: result.message });
    }

    request.log.info(`[ADMIN] Merchant bloqueado | id: ${id} | motivo: ${reason}`);
    logAction({ action: "MERCHANT_BLOCKED", actor: `admin:${request.user.id}`, target: id, metadata: { reason }, ...getRequestContext(request) });

    return reply.status(200).send({ message: result.message });
  });
};
