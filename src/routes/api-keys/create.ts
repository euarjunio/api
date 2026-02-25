import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { generateApiKey } from "../../utils/api-keys.ts";

export const createApiKeyRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).post("/", {
    schema: {
      tags: ["API Keys"],
      summary: "Criar API Key",
      description: "Cria uma nova API Key para o logista ativo do usuário",
      body: z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        description: z.string().min(1, "Descrição é obrigatória"),
      }),
      response: {
        201: z.object({
          apiKey: z.object({
            id: z.string(),
            name: z.string(),
            value: z.string(),
            description: z.string(),
            status: z.string(),
            createdAt: z.string().datetime(),
          }),
        }),
        404: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { name, description } = request.body;
    const { id } = await checkUserRequest(request);

    request.log.info({ userId: id, name }, "Creating API key");

    const existingMerchant = await prisma.merchant.findUnique({
      where: { userId: id, status: "ACTIVE" },
    });

    if (!existingMerchant) {
      request.log.warn({ userId: id }, "API key creation failed: merchant not found");
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const value = generateApiKey();

    const apiKey = await prisma.apikey.create({
      data: {
        name,
        description,
        value,
        merchantId: existingMerchant.id,
        status: "ACTIVE",
      },
    });

    request.log.info({ apiKeyId: apiKey.id, merchantId: existingMerchant.id }, "API key created successfully");

    return reply.status(201).send({
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        value: apiKey.value,
        description: apiKey.description,
        status: apiKey.status,
        createdAt: apiKey.createdAt.toISOString(),
      },
    });
  });
};
