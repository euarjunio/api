import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";

export const patchRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).patch(
    "/",
    {
      schema: {
        tags: ["Merchant"],
        summary: "Atualizar logista",
        description: "Atualiza dados do logista do usuário autenticado",
        body: z.object({
          name: z.string().optional(),
          email: z.email().optional(),
          phone: z.string().optional(),
        }),
        response: {
          200: z.object({
            merchant: z.any(),
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

      request.log.info({ userId: id, updates: { name, email, phone } }, 'Updating merchant');

      const existingMerchant = await prisma.merchant.findUnique({
        where: { userId: id },
      });

      if (!existingMerchant) {
        request.log.warn({ userId: id }, 'Merchant update failed: merchant not found');
        return reply.status(404).send({
          message: "Merchant not found",
        });
      }

      const merchant = await prisma.merchant.update({
        where: { userId: id },
        data: {
          name: name ?? existingMerchant.name,
          email: email ?? existingMerchant.email,
          phone: phone ?? existingMerchant.phone,
        },
      });

      request.log.info({ merchantId: merchant.id, userId: id }, 'Merchant updated successfully');

      return reply.status(200).send({ merchant: merchant });
    },
  );
};
