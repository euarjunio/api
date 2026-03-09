import { createHash } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { generateApiKey } from "../../utils/api-keys.ts";
import { logAction, getRequestContext } from "../../lib/audit.ts";
import { encryptSecret } from "../../lib/totp.ts";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const createApiKeyRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).post("/", {
    schema: {
      tags: ["API Keys"],
      summary: "Criar API Key",
      description: "Cria uma nova API Key para o logista ativo. A chave é exibida apenas na criação e pode ser re-visualizada via POST /api-keys/:id/reveal.",
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
        400: z.object({ message: z.string() }),
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

    const plainKey = generateApiKey();
    const keyHash = hashApiKey(plainKey);
    const keyPrefix = plainKey.slice(0, 7) + "****" + plainKey.slice(-4);
    const keyEncrypted = encryptSecret(plainKey);

    const apiKey = await prisma.apikey.create({
      data: {
        name,
        description,
        keyHash,
        keyPrefix,
        keyEncrypted,
        merchantId: existingMerchant.id,
        status: "ACTIVE",
      },
    });

    request.log.info({ apiKeyId: apiKey.id, merchantId: existingMerchant.id }, "API key created successfully");
    logAction({ action: "API_KEY_CREATED", actor: id, target: apiKey.id, metadata: { merchantId: existingMerchant.id, name }, ...getRequestContext(request) });

    return reply.status(201).send({
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        value: plainKey,
        description: apiKey.description,
        status: apiKey.status,
        createdAt: apiKey.createdAt.toISOString(),
      },
    });
  });
};
