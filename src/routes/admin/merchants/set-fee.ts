import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const setFeeRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/set-fee
  app.post("/:id/set-fee", {
    schema: {
      tags: ["Admin"],
      summary: "Configurar taxa e limites do merchant",
      description: "Define taxas (split, saque), limites de saque (diário, mensal, noturno, por transação) e limites de ticket (mín/máx)",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        feeMode: z.enum(["PERCENTUAL", "FIXADO"]).optional(),
        feeAmount: z.number().int().min(0, "Taxa não pode ser negativa").optional(),
        withdrawFee: z.number().int().min(0, "Taxa de saque não pode ser negativa").optional(),
        maxWithdrawAmount: z.number().int().min(0, "Limite por transação não pode ser negativo").optional(),
        dailyWithdrawLimit: z.number().int().min(0, "Limite diário não pode ser negativo").optional(),
        monthlyWithdrawLimit: z.number().int().min(0, "Limite mensal não pode ser negativo").optional(),
        nightWithdrawLimit: z.number().int().min(0, "Limite noturno não pode ser negativo").optional(),
        minTicketAmount: z.number().int().min(0, "Ticket mínimo não pode ser negativo").optional(),
        maxTicketAmount: z.number().int().min(0, "Ticket máximo não pode ser negativo").optional(),
      }),
      response: {
        200: z.object({
          message: z.string(),
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            feeMode: z.string(),
            feeAmount: z.number(),
            withdrawFee: z.number().nullable().default(0),
            maxWithdrawAmount: z.number().nullable().default(0),
            dailyWithdrawLimit: z.number().nullable().default(0),
            monthlyWithdrawLimit: z.number().nullable().default(0),
            nightWithdrawLimit: z.number().nullable().default(0),
            minTicketAmount: z.number().nullable().default(0),
            maxTicketAmount: z.number().nullable().default(0),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const {
      feeMode, feeAmount, withdrawFee,
      maxWithdrawAmount, dailyWithdrawLimit, monthlyWithdrawLimit, nightWithdrawLimit,
      minTicketAmount, maxTicketAmount,
    } = request.body;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        ...(feeMode !== undefined && { feeMode }),
        ...(feeAmount !== undefined && { feeAmount }),
        ...(withdrawFee !== undefined && { withdrawFee }),
        ...(maxWithdrawAmount !== undefined && { maxWithdrawAmount }),
        ...(dailyWithdrawLimit !== undefined && { dailyWithdrawLimit }),
        ...(monthlyWithdrawLimit !== undefined && { monthlyWithdrawLimit }),
        ...(nightWithdrawLimit !== undefined && { nightWithdrawLimit }),
        ...(minTicketAmount !== undefined && { minTicketAmount }),
        ...(maxTicketAmount !== undefined && { maxTicketAmount }),
      },
    });

    request.log.info({
      merchantId: id, feeMode, feeAmount, withdrawFee,
      maxWithdrawAmount, dailyWithdrawLimit, monthlyWithdrawLimit, nightWithdrawLimit,
      minTicketAmount, maxTicketAmount,
    }, "Configurações financeiras atualizadas");

    logAction({
      action: "FEE_CHANGED",
      actor: `admin:${request.user.id}`,
      target: id,
      metadata: {
        feeMode, feeAmount, withdrawFee, maxWithdrawAmount, dailyWithdrawLimit,
        monthlyWithdrawLimit, nightWithdrawLimit, minTicketAmount, maxTicketAmount,
        oldFeeMode: merchant.feeMode,
        oldFeeAmount: merchant.feeAmount,
        oldWithdrawFee: merchant.withdrawFee,
        oldMaxWithdrawAmount: merchant.maxWithdrawAmount,
        oldDailyWithdrawLimit: merchant.dailyWithdrawLimit,
        oldMonthlyWithdrawLimit: merchant.monthlyWithdrawLimit,
        oldNightWithdrawLimit: merchant.nightWithdrawLimit,
        oldMinTicketAmount: merchant.minTicketAmount,
        oldMaxTicketAmount: merchant.maxTicketAmount,
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
        withdrawFee: updated.withdrawFee ?? 0,
        maxWithdrawAmount: updated.maxWithdrawAmount ?? 0,
        dailyWithdrawLimit: updated.dailyWithdrawLimit ?? 0,
        monthlyWithdrawLimit: updated.monthlyWithdrawLimit ?? 0,
        nightWithdrawLimit: updated.nightWithdrawLimit ?? 0,
        minTicketAmount: updated.minTicketAmount ?? 0,
        maxTicketAmount: updated.maxTicketAmount ?? 0,
      },
    });
  });
};
