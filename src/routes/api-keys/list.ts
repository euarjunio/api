import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";

export const apiKeysList: FastifyPluginAsyncZod = async (app) => {
  app
    .addHook("onRequest", verifyJwt)
    .get("/api-keys", {
      schema: {
        tags: ["API Keys"],
        summary: "Listar API keys",
        description: "Retorna todas as API keys do merchant do usuário autenticado",
        response: {
          200: z.object({
            apiKeys: z.array(z.any()),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    }, async (request, reply) => {
      const { id } = await checkUserRequest(request);

      request.log.info({ userId: id }, 'Listing API keys');

      const apiKeys = await prisma.apikey.findMany({
        where: { merchant: { userId: id } },
      });

      request.log.info({ userId: id, count: apiKeys.length }, 'API keys listed');

      return reply.status(200).send({ apiKeys: apiKeys });
    });
};
