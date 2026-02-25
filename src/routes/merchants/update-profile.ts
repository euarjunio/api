import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { invalidate, CacheKeys } from "../../lib/cache.ts";

export const updateMerchantProfileRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch("/me", {
    schema: {
      tags: ["Merchants"],
      summary: "Atualizar logista",
      description: "Atualiza dados do logista do usuário autenticado",
      body: z.object({
        name: z.string().min(2).optional(),
        email: z.email().optional(),
        phone: z.string().min(10).max(15).optional(),
      }),
      response: {
        200: z.object({
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            phone: z.string(),
          }),
        }),
        404: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { name, email, phone } = request.body;
    const { id } = await checkUserRequest(request);

    request.log.info({ userId: id, updates: { name, email, phone } }, "Updating merchant");

    const existingMerchant = await prisma.merchant.findUnique({
      where: { userId: id },
    });

    if (!existingMerchant) {
      request.log.warn({ userId: id }, "Merchant update failed: merchant not found");
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const merchant = await prisma.merchant.update({
      where: { userId: id },
      data: {
        name: name ?? existingMerchant.name,
        email: email ?? existingMerchant.email,
        phone: phone ?? existingMerchant.phone,
      },
    });

    request.log.info({ merchantId: merchant.id, userId: id }, "Merchant updated successfully");

    // Invalidar cache do perfil
    await invalidate(CacheKeys.profile(id));

    return reply.status(200).send({
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        phone: merchant.phone,
      },
    });
  });
};
