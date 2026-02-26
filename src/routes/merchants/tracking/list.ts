import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { getAllPluginNames } from "../../../plugins/tracker.registry.ts";

export const listTrackingRoute: FastifyPluginAsyncZod = async (app) => {
  app.get("/", {
    schema: {
      tags: ["Tracking"],
      summary: "Listar plugins de tracking configurados",
      description: "Retorna os plugins de tracking do merchant e a lista de plugins disponíveis.",
      response: {
        200: z.object({
          availablePlugins: z.array(z.string()),
          trackings: z.array(z.object({
            id: z.string(),
            provider: z.string(),
            enabled: z.boolean(),
            createdAt: z.string().datetime(),
            updatedAt: z.string().datetime(),
          })),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const trackings = await prisma.merchantTracking.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "asc" },
    });

    return reply.status(200).send({
      availablePlugins: getAllPluginNames(),
      trackings: trackings.map((t) => ({
        id: t.id,
        provider: t.provider,
        enabled: t.enabled,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  });
};
