import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { logAction, getRequestContext } from "../../../lib/audit.ts";
import { rejectMerchant } from "../../../services/merchant.service.ts";

export const rejectMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/:id/reject", {
    schema: {
      tags: ["Admin"],
      summary: "Rejeitar merchant",
      description: "Rejeita o KYC com motivo",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        reason: z.string().min(5, "Motivo deve ter pelo menos 5 caracteres"),
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

    const result = await rejectMerchant(id, reason, request.log);
    if (!result.ok) {
      return reply.status(result.status).send({ message: result.message });
    }

    logAction({ action: "MERCHANT_REJECTED", actor: `admin:${request.user.id}`, target: id, metadata: { reason }, ...getRequestContext(request) });

    return reply.status(200).send({ message: result.message });
  });
};
