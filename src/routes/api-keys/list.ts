import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";

export const listApiKeysRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).get("/", {
    schema: {
      tags: ["API Keys"],
      summary: "Listar API Keys",
      description: "Lista todas as API Keys do logista autenticado",
      response: {
        200: z.object({
          apiKeys: z.array(z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            value: z.string(),
            status: z.string(),
            createdAt: z.string().datetime(),
          })),
        }),
        404: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = await checkUserRequest(request);

    request.log.info({ userId: id }, "Listing API keys");

    const existingMerchant = await prisma.merchant.findUnique({
      where: { userId: id },
    });

    if (!existingMerchant) {
      request.log.warn({ userId: id }, "API key listing failed: merchant not found");
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const apiKeys = await prisma.apikey.findMany({
      where: { merchantId: existingMerchant.id },
      orderBy: { createdAt: "desc" },
    });

    return reply.status(200).send({
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        description: key.description,
        value: key.value,
        status: key.status,
        createdAt: key.createdAt.toISOString(),
      })),
    });
  });
};
