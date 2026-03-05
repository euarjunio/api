import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { env } from "../../../config/env.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { getProviderForMerchant } from "../../../providers/acquirer.registry.ts";
import { invalidateMerchantCaches } from "../../../lib/cache.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

const PIX_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "CHAVE_ALEATORIA"] as const;

export const createWithdrawalRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/merchants/me/withdrawals
  app.post("/", {
    schema: {
      tags: ["Withdrawals"],
      summary: "Solicitar saque",
      description: "Solicita a retirada do saldo disponível. Cria um lote de transferência PIX no adquirente.",
      body: z.object({
        amount: z.number().int().min(1, "Valor mínimo de 1 centavo"),
        pixKeyType: z.enum(PIX_KEY_TYPES).describe("Tipo da chave PIX de destino"),
        pixKey: z.string().min(1, "Chave PIX é obrigatória").describe("Chave PIX de destino do saque"),
        description: z.string().max(200).optional(),
      }),
      response: {
        201: z.object({
          message: z.string(),
          withdraw: z.object({
            id: z.string(),
            amount: z.number(),
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
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { amount, pixKeyType, pixKey, description } = request.body;

    if (amount < env.MIN_WITHDRAW_AMOUNT) {
      return reply.status(400).send({
        message: `Valor mínimo para saque: R$ ${(env.MIN_WITHDRAW_AMOUNT / 100).toFixed(2)}`,
      });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        kycStatus: true,
        status: true,
        acquirer: true,
        acquirerAccountId: true,
        maxWithdrawAmount: true,
        dailyWithdrawLimit: true,
      },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    if (merchant.kycStatus !== "APPROVED") {
      return reply.status(400).send({ message: "KYC precisa estar aprovado para solicitar saque" });
    }

    if (merchant.status !== "ACTIVE") {
      return reply.status(400).send({ message: "Merchant está inativo" });
    }

    if (!merchant.acquirerAccountId) {
      return reply.status(400).send({ message: "Conta do adquirente não configurada. Contate o suporte." });
    }

    // Validação do limite por transação
    if (merchant.maxWithdrawAmount > 0 && amount > merchant.maxWithdrawAmount) {
      return reply.status(400).send({
        message: `Valor máximo por saque: R$ ${(merchant.maxWithdrawAmount / 100).toFixed(2)}`,
      });
    }

    // Validação do limite diário acumulado
    if (merchant.dailyWithdrawLimit > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayTotal = await prisma.ledger.aggregate({
        where: {
          merchantId: merchant.id,
          type: "WITHDRAW",
          createdAt: { gte: startOfDay },
        },
        _sum: { amount: true },
      });

      const usedToday = Math.abs(todayTotal._sum.amount ?? 0);

      if (usedToday + amount > merchant.dailyWithdrawLimit) {
        const remaining = Math.max(0, merchant.dailyWithdrawLimit - usedToday);
        return reply.status(400).send({
          message: `Limite diário de saques atingido. Restante hoje: R$ ${(remaining / 100).toFixed(2)}`,
        });
      }
    }

    // 1. Criar entrada no ledger (deduz saldo imediatamente)
    const result = await ledgerService.requestWithdraw({
      merchantId: merchant.id,
      amount,
      description,
      pixKey,
      pixKeyType,
    });

    if (!result.success) {
      return reply.status(400).send({ message: result.message });
    }

    const ledgerEntry = result.ledgerEntry;

    // 2. Criar lote de transferência no adquirente
    let batchId: string | null = null;

    try {
      const provider = await getProviderForMerchant(merchant.id);
      const token = await provider.getMerchantToken(merchant.acquirerAccountId);

      const batch = await provider.createTransferBatch(token, {
        name: `Saque ${merchant.name} #${ledgerEntry.id.slice(0, 8)}`,
        transfers: [
          {
            value: amount / 100,
            integrationId: ledgerEntry.id,
            idempotencyKey: ledgerEntry.id,
            pixDescription: description ?? `Saque ${merchant.name}`,
            destination: {
              pixKeyType,
              pixKey,
            },
          },
        ],
      });

      batchId = batch.batchId;
      const transferId = batch.transfers[0]?.id ?? null;

      // 3. Atualizar metadata do ledger com dados do adquirente
      await prisma.ledger.update({
        where: { id: ledgerEntry.id },
        data: {
          metadata: {
            ...(ledgerEntry.metadata as object ?? {}),
            withdrawStatus: "PROCESSING",
            batchId,
            transferId,
            pixKey,
            pixKeyType,
            sentAt: new Date().toISOString(),
          },
        },
      });

      request.log.info(
        `💸  [WITHDRAW] Lote criado no adquirente | merchantId: ${merchant.id} | batchId: ${batchId} | R$ ${(amount / 100).toFixed(2)} → ${pixKeyType}:${pixKey}`
      );
    } catch (err: any) {
      // Adquirente falhou — reverter o saque no ledger
      request.log.error(
        `💸  [WITHDRAW] Erro adquirente — revertendo saque | ledgerId: ${ledgerEntry.id} | erro: ${err?.message}`
      );

      try {
        await ledgerService.reverseWithdraw(ledgerEntry.id, err?.message ?? "Erro ao criar transferência");
      } catch (reverseErr: any) {
        request.log.error(
          `💸  [WITHDRAW] CRÍTICO — falha ao reverter saque | ledgerId: ${ledgerEntry.id} | erro: ${reverseErr?.message}`
        );
      }

      throw err;
    }

    logAction({ action: "WITHDRAW_REQUESTED", actor: userId, target: ledgerEntry.id, metadata: { merchantId: merchant.id, amount, pixKey, batchId }, ...getRequestContext(request) });

    // Invalidar caches do merchant
    await invalidateMerchantCaches(merchant.id);

    const balance = await ledgerService.getBalance(merchant.id);

    return reply.status(201).send({
      message: "Saque em processamento",
      withdraw: {
        id: ledgerEntry.id,
        amount: Math.abs(ledgerEntry.amount),
        description: ledgerEntry.description,
        status: "PROCESSING",
        batchId,
        createdAt: ledgerEntry.createdAt.toISOString(),
      },
      balance,
    });
  });
};
