import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { getPlugin, getAllPluginNames } from "../../../plugins/tracker.registry.ts";

export const createTrackingRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/", {
    schema: {
      tags: ["Tracking"],
      summary: "Configurar um plugin de tracking",
      description: "Configura UTMify ou Meta Pixel para o merchant. Cada plugin só pode ser configurado uma vez.",
      body: z.object({
        provider: z.string().min(1),
        credentials: z.record(z.string(), z.any()),
      }),
      response: {
        201: z.object({
          tracking: z.object({
            id: z.string(),
            provider: z.string(),
            enabled: z.boolean(),
            createdAt: z.string().datetime(),
          }),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
        409: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { provider, credentials } = request.body;

    // Validar se o plugin existe
    if (!getPlugin(provider)) {
      return reply.status(400).send({
        message: `Plugin "${provider}" não existe. Disponíveis: ${getAllPluginNames().join(", ")}`,
      });
    }

    // Validar credenciais mínimas por provider
    if (provider === "utmify" && !credentials.apiToken) {
      return reply.status(400).send({
        message: "UTMify requer o campo 'apiToken' nas credenciais.",
      });
    }
    if (provider === "meta_pixel" && (!credentials.pixelId || !credentials.accessToken)) {
      return reply.status(400).send({
        message: "Meta Pixel requer os campos 'pixelId' e 'accessToken' nas credenciais.",
      });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    // Verificar se já existe
    const existing = await prisma.merchantTracking.findUnique({
      where: {
        merchantId_provider: {
          merchantId: merchant.id,
          provider,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({
        message: `Plugin "${provider}" já está configurado. Use PATCH para atualizar.`,
      });
    }

    const tracking = await prisma.merchantTracking.create({
      data: {
        provider,
        credentials,
        merchantId: merchant.id,
      },
    });

    return reply.status(201).send({
      tracking: {
        id: tracking.id,
        provider: tracking.provider,
        enabled: tracking.enabled,
        createdAt: tracking.createdAt.toISOString(),
      },
    });
  });
};
