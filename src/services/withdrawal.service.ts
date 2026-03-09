import { prisma } from "../lib/prisma.ts";
import { env } from "../config/env.ts";
import { redis } from "../lib/redis.ts";
import { ledgerService } from "./ledger.service.ts";
import { getProviderForMerchant } from "../providers/acquirer.registry.ts";
import { decryptSecret, verifyToken } from "../lib/totp.ts";

import { MAX_2FA_ATTEMPTS, LOCKOUT_TTL_SECONDS } from "../config/constants.ts";

function attemptsKey(userId: string) {
  return `withdraw_2fa_attempts:${userId}`;
}

type Verify2FAResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 429; message: string };

export async function verify2FA(userId: string, totpCode: string): Promise<Verify2FAResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, status: 403, message: "Ative a autenticação 2FA para solicitar saques." };
  }

  const key = attemptsKey(userId);
  const currentAttempts = parseInt(await redis.get(key) ?? "0", 10);

  if (currentAttempts >= MAX_2FA_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    return {
      ok: false,
      status: 429,
      message: `Muitas tentativas incorretas. Tente novamente em ${Math.ceil(ttl / 60)} minuto(s).`,
    };
  }

  const secret = decryptSecret(user.twoFactorSecret);
  if (!verifyToken(secret, totpCode)) {
    const newCount = await redis.incr(key);
    if (newCount === 1) await redis.expire(key, LOCKOUT_TTL_SECONDS);
    const remaining = MAX_2FA_ATTEMPTS - newCount;
    return {
      ok: false,
      status: 401,
      message: remaining > 0
        ? `Código 2FA inválido. ${remaining} tentativa${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`
        : "Muitas tentativas incorretas. Conta bloqueada temporariamente.",
    };
  }

  await redis.del(key);
  return { ok: true };
}

type MerchantForWithdraw = {
  id: string;
  name: string;
  acquirer: string;
  acquirerAccountId: string;
  withdrawFee: number;
  maxWithdrawAmount: number;
  dailyWithdrawLimit: number;
  monthlyWithdrawLimit: number;
  nightWithdrawLimit: number;
};

type ValidateResult =
  | { ok: true; merchant: MerchantForWithdraw }
  | { ok: false; status: 400 | 404; message: string };

export async function validateWithdrawal(userId: string, amount: number): Promise<ValidateResult> {
  if (amount < env.MIN_WITHDRAW_AMOUNT) {
    return {
      ok: false, status: 400,
      message: `Valor mínimo para saque: R$ ${(env.MIN_WITHDRAW_AMOUNT / 100).toFixed(2)}`,
    };
  }

  const merchant = await prisma.merchant.findUnique({
    where: { userId },
    select: {
      id: true, name: true, kycStatus: true, status: true,
      acquirer: true, acquirerAccountId: true,
      maxWithdrawAmount: true, dailyWithdrawLimit: true,
      monthlyWithdrawLimit: true, nightWithdrawLimit: true,
      withdrawFee: true,
    },
  });

  if (!merchant) return { ok: false, status: 404, message: "Merchant não encontrado" };
  if (merchant.kycStatus !== "APPROVED") return { ok: false, status: 400, message: "KYC precisa estar aprovado para solicitar saque" };
  if (merchant.status !== "ACTIVE") return { ok: false, status: 400, message: "Merchant está inativo" };
  if (!merchant.acquirerAccountId) return { ok: false, status: 400, message: "Conta do adquirente não configurada. Contate o suporte." };

  if (merchant.maxWithdrawAmount > 0 && amount > merchant.maxWithdrawAmount) {
    return { ok: false, status: 400, message: `Valor máximo por saque: R$ ${(merchant.maxWithdrawAmount / 100).toFixed(2)}` };
  }

  if (merchant.dailyWithdrawLimit > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTotal = await prisma.ledger.aggregate({
      where: { merchantId: merchant.id, type: "WITHDRAW", createdAt: { gte: startOfDay } },
      _sum: { amount: true },
    });
    const usedToday = Math.abs(todayTotal._sum.amount ?? 0);
    if (usedToday + amount > merchant.dailyWithdrawLimit) {
      const remaining = Math.max(0, merchant.dailyWithdrawLimit - usedToday);
      return { ok: false, status: 400, message: `Limite diário de saques atingido. Restante hoje: R$ ${(remaining / 100).toFixed(2)}` };
    }
  }

  if (merchant.monthlyWithdrawLimit > 0) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthTotal = await prisma.ledger.aggregate({
      where: { merchantId: merchant.id, type: "WITHDRAW", createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    });
    const usedThisMonth = Math.abs(monthTotal._sum.amount ?? 0);
    if (usedThisMonth + amount > merchant.monthlyWithdrawLimit) {
      const remaining = Math.max(0, merchant.monthlyWithdrawLimit - usedThisMonth);
      return { ok: false, status: 400, message: `Limite mensal de saques atingido. Restante este mês: R$ ${(remaining / 100).toFixed(2)}` };
    }
  }

  if (merchant.nightWithdrawLimit > 0) {
    const hour = new Date().getHours();
    if ((hour >= 20 || hour < 8) && amount > merchant.nightWithdrawLimit) {
      return { ok: false, status: 400, message: `Limite de saque noturno (20h–8h): R$ ${(merchant.nightWithdrawLimit / 100).toFixed(2)}` };
    }
  }

  return { ok: true, merchant: merchant as MerchantForWithdraw };
}

type ProcessWithdrawParams = {
  merchant: MerchantForWithdraw;
  amount: number;
  pixKeyType: string;
  pixKey: string;
  description?: string;
  log: { info: (msg: string) => void; error: (msg: string) => void };
};

type ProcessWithdrawResult = {
  ledgerEntry: { id: string; amount: number; description: string | null; createdAt: Date };
  batchId: string | null;
  withdrawFee: number;
};

export async function processWithdrawal(params: ProcessWithdrawParams): Promise<ProcessWithdrawResult> {
  const { merchant, amount, pixKeyType, pixKey, description, log } = params;
  const withdrawFee = merchant.withdrawFee;

  const result = await ledgerService.requestWithdraw({
    merchantId: merchant.id,
    amount,
    withdrawFee,
    description,
    pixKey,
    pixKeyType,
  });

  if (!result.success || !result.ledgerEntry) {
    throw new WithdrawError(result.message, 400);
  }

  const ledgerEntry = result.ledgerEntry;
  let batchId: string | null = null;

  try {
    const provider = await getProviderForMerchant(merchant.id);
    const token = await provider.getMerchantToken(merchant.acquirerAccountId);

    const transfers = [
      {
        value: amount / 100,
        integrationId: ledgerEntry.id,
        idempotencyKey: ledgerEntry.id,
        pixDescription: description ?? `Saque ${merchant.name}`,
        destination: { pixKeyType, pixKey },
      },
    ];

    if (withdrawFee > 0) {
      transfers.push({
        value: withdrawFee / 100,
        integrationId: `${ledgerEntry.id}-fee`,
        idempotencyKey: `${ledgerEntry.id}-fee`,
        pixDescription: `Taxa de saque ${merchant.name}`,
        destination: { pixKeyType: env.PLATFORM_PIX_KEY_TYPE, pixKey: env.PLATFORM_PIX_KEY },
      });
    }

    const batch = await provider.createTransferBatch(token, {
      name: `Saque ${merchant.name} #${ledgerEntry.id.slice(0, 8)}`,
      transfers,
    });

    batchId = batch.batchId;
    const transferId = batch.transfers[0]?.id ?? null;

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
          withdrawFee,
          sentAt: new Date().toISOString(),
        },
      },
    });

    log.info(
      `💸  [WITHDRAW] Lote criado | merchantId: ${merchant.id} | batchId: ${batchId} | R$ ${(amount / 100).toFixed(2)} → ${pixKeyType}:${pixKey}${withdrawFee > 0 ? ` | taxa: R$ ${(withdrawFee / 100).toFixed(2)}` : ""}`,
    );
  } catch (err: any) {
    log.error(`💸  [WITHDRAW] Erro adquirente — revertendo saque | ledgerId: ${ledgerEntry.id} | erro: ${err?.message}`);
    try {
      await ledgerService.reverseWithdraw(ledgerEntry.id, err?.message ?? "Erro ao criar transferência");
    } catch (reverseErr: any) {
      log.error(`💸  [WITHDRAW] CRÍTICO — falha ao reverter saque | ledgerId: ${ledgerEntry.id} | erro: ${reverseErr?.message}`);
    }
    throw err;
  }

  return { ledgerEntry, batchId, withdrawFee };
}

export class WithdrawError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "WithdrawError";
  }
}
