import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";

export const getRoute: FastifyPluginAsyncZod = async (app) => {
  app
    .addHook("onRequest", verifyJwt)
    .get("/", {
      schema: {
        tags: ["API Key"],
        summary: "Listar API Key",
        description: "Retorna todas as API Key do logista do usuário autenticado",
        response: {
          200: z.object({
            apiKey: z.array(z.any()),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    }, async (request, reply) => {
      const { id } = await checkUserRequest(request);

      request.log.info({ userId: id }, 'Listing API keys');

      const apiKey = await prisma.apikey.findMany({
        where: { merchant: { userId: id } },
      });

      request.log.info({ userId: id, count: apiKey.length }, 'API key listed');

      return reply.status(200).send({ apiKey: apiKey });
    });
};
