import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const blockMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/block
  app.post("/:id/block", {
    schema: {
      tags: ["Admin"],
      summary: "Bloquear merchant",
      description: "Desativa o merchant. Impede criação de cobranças e saques.",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        reason: z.string().min(3, "Motivo deve ter pelo menos 3 caracteres"),
      }),
      response: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    if (merchant.status === "INACTIVE") {
      return reply.status(400).send({ message: "Merchant já está bloqueado." });
    }

    await prisma.merchant.update({
      where: { id },
      data: {
        status: "INACTIVE",
        metadata: {
          ...(merchant.metadata as object ?? {}),
          blockedAt: new Date().toISOString(),
          blockedReason: reason,
        },
      },
    });

    // Desativar todas as API Keys do merchant
    await prisma.apikey.updateMany({
      where: { merchantId: id, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });

    request.log.info(`🚫  [ADMIN] Merchant bloqueado | id: ${id} | motivo: ${reason}`);

    return reply.status(200).send({ message: "Merchant bloqueado com sucesso." });
  });
};
