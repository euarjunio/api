import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";

export const updateTrackingRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch("/:provider", {
    schema: {
      tags: ["Tracking"],
      summary: "Atualizar plugin de tracking",
      description: "Atualiza credenciais e/ou habilita/desabilita um plugin de tracking.",
      params: z.object({
        provider: z.string(),
      }),
      body: z.object({
        enabled: z.boolean().optional(),
        credentials: z.record(z.string(), z.any()).optional(),
      }),
      response: {
        200: z.object({
          tracking: z.object({
            id: z.string(),
            provider: z.string(),
            enabled: z.boolean(),
            updatedAt: z.string().datetime(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { provider } = request.params;
    const { enabled, credentials } = request.body;

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
        message: `Plugin "${provider}" não está configurado. Use POST para criar.`,
      });
    }

    const updateData: any = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (credentials) {
      // Merge: credenciais novas sobrescrevem apenas os campos enviados,
      // mantendo os valores existentes que não foram alterados.
      const existingCreds = (existing.credentials as Record<string, any>) ?? {};
      updateData.credentials = { ...existingCreds, ...credentials };
    }

    const tracking = await prisma.merchantTracking.update({
      where: { id: existing.id },
      data: updateData,
    });

    return reply.status(200).send({
      tracking: {
        id: tracking.id,
        provider: tracking.provider,
        enabled: tracking.enabled,
        updatedAt: tracking.updatedAt.toISOString(),
      },
    });
  });
};
