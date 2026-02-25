import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const unblockMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/unblock
  app.post("/:id/unblock", {
    schema: {
      tags: ["Admin"],
      summary: "Desbloquear merchant",
      description: "Reativa o merchant.",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    if (merchant.status === "ACTIVE") {
      return reply.status(400).send({ message: "Merchant já está ativo." });
    }

    await prisma.merchant.update({
      where: { id },
      data: {
        status: "ACTIVE",
        metadata: {
          ...(merchant.metadata as object ?? {}),
          unblockedAt: new Date().toISOString(),
        },
      },
    });

    request.log.info(`✅  [ADMIN] Merchant desbloqueado | id: ${id}`);

    return reply.status(200).send({ message: "Merchant desbloqueado com sucesso." });
  });
};
