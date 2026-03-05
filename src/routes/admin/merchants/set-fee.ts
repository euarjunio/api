import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const setFeeRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/set-fee
  app.post("/:id/set-fee", {
    schema: {
      tags: ["Admin"],
      summary: "Configurar taxa e limites de saque do merchant",
      description: "Define a taxa de cobrança (split), o valor máximo por saque e o limite diário de saques",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        feeMode: z.enum(["PERCENTUAL", "FIXADO"]).optional(),
        feeAmount: z.number().int().min(0, "Taxa não pode ser negativa").optional(),
        maxWithdrawAmount: z.number().int().min(0, "Limite por transação não pode ser negativo").optional(),
        dailyWithdrawLimit: z.number().int().min(0, "Limite diário não pode ser negativo").optional(),
      }),
      response: {
        200: z.object({
          message: z.string(),
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            feeMode: z.string(),
            feeAmount: z.number(),
            maxWithdrawAmount: z.number(),
            dailyWithdrawLimit: z.number(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { feeMode, feeAmount, maxWithdrawAmount, dailyWithdrawLimit } = request.body;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        ...(feeMode !== undefined && { feeMode }),
        ...(feeAmount !== undefined && { feeAmount }),
        ...(maxWithdrawAmount !== undefined && { maxWithdrawAmount }),
        ...(dailyWithdrawLimit !== undefined && { dailyWithdrawLimit }),
      },
    });

    request.log.info({ merchantId: id, feeMode, feeAmount, maxWithdrawAmount, dailyWithdrawLimit }, "Configurações financeiras atualizadas");
    logAction({
      action: "FEE_CHANGED",
      actor: `admin:${request.user.id}`,
      target: id,
      metadata: {
        feeMode, feeAmount, maxWithdrawAmount, dailyWithdrawLimit,
        oldFeeMode: merchant.feeMode,
        oldFeeAmount: merchant.feeAmount,
        oldMaxWithdrawAmount: merchant.maxWithdrawAmount,
        oldDailyWithdrawLimit: merchant.dailyWithdrawLimit,
      },
      ...getRequestContext(request),
    });

    return reply.status(200).send({
      message: "Configurações atualizadas com sucesso.",
      merchant: {
        id: updated.id,
        name: updated.name,
        feeMode: updated.feeMode,
        feeAmount: updated.feeAmount,
        maxWithdrawAmount: updated.maxWithdrawAmount,
        dailyWithdrawLimit: updated.dailyWithdrawLimit,
      },
    });
  });
};
