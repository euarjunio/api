import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";

export const deleteTrackingRoute: FastifyPluginAsyncZod = async (app) => {
  app.delete("/:provider", {
    schema: {
      tags: ["Tracking"],
      summary: "Remover plugin de tracking",
      description: "Remove a configuração de um plugin de tracking do merchant.",
      params: z.object({
        provider: z.string(),
      }),
      response: {
        200: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { provider } = request.params;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const existing = await prisma.merchantTracking.findUnique({
      where: {
        merchantId_provider: {
          merchantId: merchant.id,
          provider,
        },
      },
    });

    if (!existing) {
      return reply.status(404).send({
        message: `Plugin "${provider}" não está configurado.`,
      });
    }

    await prisma.merchantTracking.delete({
      where: { id: existing.id },
    });

    return reply.status(200).send({
      message: `Plugin "${provider}" removido com sucesso.`,
    });
  });
};
