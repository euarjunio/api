import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const setFeeRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/set-fee
  app.post("/:id/set-fee", {
    schema: {
      tags: ["Admin"],
      summary: "Configurar taxa do merchant",
      description: "Define o modo e valor da taxa cobrada pela plataforma (split)",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        feeMode: z.enum(["PERCENTUAL", "FIXADO"]),
        feeAmount: z.number().min(0, "Taxa não pode ser negativa"),
      }),
      response: {
        200: z.object({
          message: z.string(),
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            feeMode: z.string(),
            feeAmount: z.number(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { feeMode, feeAmount } = request.body;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    const updated = await prisma.merchant.update({
      where: { id },
      data: { feeMode, feeAmount },
    });

    request.log.info({ merchantId: id, feeMode, feeAmount }, "Fee configurada");
    logAction({ action: "FEE_CHANGED", actor: `admin:${request.user.id}`, target: id, metadata: { feeMode, feeAmount, oldFeeMode: merchant.feeMode, oldFeeAmount: merchant.feeAmount }, ...getRequestContext(request) });

    return reply.status(200).send({
      message: "Taxa configurada com sucesso.",
      merchant: {
        id: updated.id,
        name: updated.name,
        feeMode: updated.feeMode,
        feeAmount: updated.feeAmount,
      },
    });
  });
};
