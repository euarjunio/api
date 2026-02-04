import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";
import { z } from "zod/v4";

export const getListRoute: FastifyPluginAsyncZod = async (app) => {
  app
    .addHook("onRequest", verifyJwt)
    .get("/", {
      schema: {
        tags: ["Merchant"],
        summary: "Listar logistas",
        description: "Retorna o logista do usuário autenticado",
        response: {
          200: z.object({
            merchant: z.any(),
          }),
          401: z.object({
            message: z.string(),
          }),
          404: z.object({
            message: z.string(),
          }),
        },
      },
    }, async (request, reply) => {
      const { id } = await checkUserRequest(request);

      request.log.info({ userId: id }, 'Listing merchants');

      const merchant = await prisma.merchant.findUnique({
        where: { userId: id },
      });

      request.log.info({ userId: id }, 'Merchant listed');

      return reply.status(200).send({ merchant: merchant ?? {} });
    });
};
