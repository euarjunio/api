import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";

export const deleteApiKeyRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).delete("/:id", {
    schema: {
      tags: ["API Keys"],
      summary: "Deletar API Key",
      description: "Deleta uma API Key específica do logista autenticado",
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: keyId } = request.params;
    const { id: userId } = await checkUserRequest(request);

    request.log.info({ userId, keyId }, "Deleting API key");

    const existingMerchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!existingMerchant) {
      request.log.warn({ userId }, "API key deletion failed: merchant not found");
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const existingKey = await prisma.apikey.findFirst({
      where: { id: keyId, merchantId: existingMerchant.id },
    });

    if (!existingKey) {
      request.log.warn({ userId, keyId }, "API key deletion failed: key not found");
      return reply.status(404).send({ message: "API key não encontrada" });
    }

    await prisma.apikey.delete({ where: { id: keyId } });

    request.log.info({ keyId, merchantId: existingMerchant.id }, "API key deleted successfully");

    return reply.status(200).send({ message: "API key deletada com sucesso" });
  });
};
