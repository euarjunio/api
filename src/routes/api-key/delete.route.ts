import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";

export const deleteRoute: FastifyPluginAsyncZod = async (app) => {
  app
    .addHook("onRequest", verifyJwt)
    .delete(
      "/:id",
      {
        schema: {
          tags: ["API Key"],
          summary: "Deletar API Key",
          description: "Remove uma API Key específica do logista do usuário",
          params: z.object({ id: z.uuid() }),
          response: {
            200: z.object({
              message: z.string(),
            }),
            404: z.object({
              message: z.string(),
            }),
            401: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const { id: userId } = await checkUserRequest(request);

        request.log.info({ apiKeyId: id, userId }, 'Deleting API key');

        const apiKey = await prisma.apikey.findUnique({
          where: { id },
          include: { merchant: true },
        });

        if (!apiKey || apiKey.merchant.userId !== userId) {
          request.log.warn({ apiKeyId: id, userId }, 'API key deletion failed: not found or unauthorized');
          return reply.status(404).send({ message: "API key not found" });
        }

        await prisma.apikey.delete({
          where: { id },
        });

        request.log.info({ apiKeyId: id, userId }, 'API key deleted successfully');

        return reply
          .status(200)
          .send({ message: "API key deleted successfully" });
      },
    );
};
