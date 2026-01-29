import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";
import { z } from "zod/v4";

export const merchantList: FastifyPluginAsyncZod = async (app) => {
  app
    .addHook("onRequest", verifyJwt)
    .get("/merchants", {
      schema: {
        tags: ["Merchants"],
        summary: "Listar merchants",
        description: "Retorna todos os merchants do usuário autenticado",
        response: {
          200: z.object({
            merchants: z.array(z.any()),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    }, async (request, reply) => {
      const { id } = await checkUserRequest(request);

      request.log.info({ userId: id }, 'Listing merchants');

      const merchants = await prisma.merchant.findMany({
        where: { userId: id },
      });

      request.log.info({ userId: id, count: merchants.length }, 'Merchants listed');

      return reply.status(200).send({ merchants: merchants });
    });
};
