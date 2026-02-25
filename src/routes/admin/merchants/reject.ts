import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const rejectMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/reject
  app.post("/:id/reject", {
    schema: {
      tags: ["Admin"],
      summary: "Rejeitar merchant",
      description: "Rejeita o KYC com motivo",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        reason: z.string().min(5, "Motivo deve ter pelo menos 5 caracteres"),
      }),
      response: {
        200: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    await prisma.merchant.update({
      where: { id },
      data: {
        kycStatus: "REJECTED",
        kycNotes: reason,
        kycAnalyzedAt: new Date(),
      },
    });

    return reply.status(200).send({ message: "Merchant rejeitado." });
  });
};
