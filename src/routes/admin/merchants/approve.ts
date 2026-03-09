import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { logAction, getRequestContext } from "../../../lib/audit.ts";
import { approveMerchant } from "../../../services/merchant.service.ts";

export const approveMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/:id/approve", {
    schema: {
      tags: ["Admin"],
      summary: "Aprovar merchant",
      description: "Aprova o KYC e cria conta no adquirente. O merchant deve cadastrar a chave PIX depois.",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({
          message: z.string(),
          acquirerAccountId: z.string().nullish(),
          error: z.string().nullish(),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const result = await approveMerchant(id, request.log);
    if (!result.ok) {
      return reply.status(result.status).send({ message: result.message });
    }

    logAction({ action: "MERCHANT_APPROVED", actor: `admin:${request.user.id}`, target: id, ...getRequestContext(request) });

    return reply.status(200).send({
      message: result.message,
      acquirerAccountId: result.extra?.acquirerAccountId as string | undefined,
      error: result.extra?.error as string | undefined,
    });
  });
};
