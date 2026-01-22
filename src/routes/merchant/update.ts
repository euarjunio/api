import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";

export const merchantUpdate: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).patch(
    "/merchants",
    {
      schema: {
        tags: ["Merchants"],
        summary: "Atualizar merchant",
        description: "Atualiza dados do merchant do usuário autenticado",
        body: z.object({
          name: z.string().optional(),
          email: z.email().optional(),
          phone: z.string().optional(),
        }),
        response: {
          200: z.object({
            merchants: z.any(),
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
      const { name, email, phone } = request.body;

      const { id } = await checkUserRequest(request);

      const existingMerchant = await prisma.merchant.findUnique({
        where: { userId: id },
      });

      if (!existingMerchant) {
        return reply.status(404).send({
          message: "Merchant not found",
        });
      }

      const merchants = await prisma.merchant.update({
        where: { userId: id },
        data: {
          name: name ?? existingMerchant.name,
          email: email ?? existingMerchant.email,
          phone: phone ?? existingMerchant.phone,
        },
      });

      return reply.status(200).send({ merchants: merchants });
    },
  );
};
