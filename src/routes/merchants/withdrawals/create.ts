import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { invalidateMerchantCaches } from "../../../lib/cache.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { verify2FA, validateWithdrawal, processWithdrawal } from "../../../services/withdrawal.service.ts";

const PIX_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "CHAVE_ALEATORIA"] as const;

export const createWithdrawalRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/", {
    schema: {
      tags: ["Withdrawals"],
      summary: "Solicitar saque",
      description: "Solicita a retirada do saldo disponível. Requer código 2FA. Cria um lote de transferência PIX no adquirente.",
      body: z.object({
        amount: z.number().int().min(1, "Valor mínimo de 1 centavo"),
        pixKeyType: z.enum(PIX_KEY_TYPES).describe("Tipo da chave PIX de destino"),
        pixKey: z.string().min(1, "Chave PIX é obrigatória").describe("Chave PIX de destino do saque"),
        totpCode: z.string().length(6, "Código 2FA deve ter 6 dígitos"),
        description: z.string().max(200).optional(),
      }),
      response: {
        201: z.object({
          message: z.string(),
          withdraw: z.object({
            id: z.string(),
            amount: z.number(),
            fee: z.number(),
            description: z.string().nullable(),
            status: z.string(),
            batchId: z.string().nullable(),
            createdAt: z.string().datetime(),
          }),
          balance: z.object({
            pending: z.number(),
            available: z.number(),
            blocked: z.number(),
            total: z.number(),
          }),
        }),
        400: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
        403: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
        429: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { amount, pixKeyType, pixKey, totpCode, description } = request.body;

    const authResult = await verify2FA(userId, totpCode);
    if (!authResult.ok) {
      return reply.status(authResult.status).send({ message: authResult.message });
    }

    const validation = await validateWithdrawal(userId, amount);
    if (!validation.ok) {
      return reply.status(validation.status).send({ message: validation.message });
    }

    const { ledgerEntry, batchId, withdrawFee } = await processWithdrawal({
      merchant: validation.merchant,
      amount,
      pixKeyType,
      pixKey,
      description,
      log: { info: (msg) => request.log.info(msg), error: (msg) => request.log.error(msg) },
    });

    logAction({
      action: "WITHDRAW_REQUESTED",
      actor: userId,
      target: ledgerEntry.id,
      metadata: { merchantId: validation.merchant.id, amount, withdrawFee, pixKey, batchId },
      ...getRequestContext(request),
    });

    await invalidateMerchantCaches(validation.merchant.id);
    const balance = await ledgerService.getBalance(validation.merchant.id);

    return reply.status(201).send({
      message: "Saque em processamento",
      withdraw: {
        id: ledgerEntry.id,
        amount: Math.abs(ledgerEntry.amount),
        fee: withdrawFee,
        description: ledgerEntry.description,
        status: "PROCESSING",
        batchId,
        createdAt: ledgerEntry.createdAt.toISOString(),
      },
      balance,
    });
  });
};
