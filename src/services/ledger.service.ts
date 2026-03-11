import { prisma } from "../lib/prisma.ts";
import type { LedgerType, LedgerStatus } from "../lib/generated/prisma/enums.ts";
import type { LedgerModel } from "../lib/generated/prisma/models/Ledger.ts";

// ── Tipos ────────────────────────────────────────────────────────────

export interface AddTransactionParams {
  merchantId: string;
  amount: number;       // Centavos (positivo = entrada, negativo = saída)
  type: LedgerType;
  status?: LedgerStatus;
  description?: string;
  chargeId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MerchantBalance {
  pending: number;    // Centavos - aguardando liquidação
  available: number;  // Centavos - disponível para saque
  blocked: number;    // Centavos - bloqueado
  total: number;      // Centavos - soma de tudo
}

export interface WithdrawResult {
  success: boolean;
  ledgerEntry?: LedgerModel;
  message: string;
}

// ── Service ──────────────────────────────────────────────────────────

export class LedgerService {
  /**
   * Registra uma transação no livro razão.
   * Cada movimentação financeira (entrada, taxa, saque, estorno) gera um registro imutável.
   */
  async addTransaction(params: AddTransactionParams) {
    const { merchantId, amount, type, status = "PENDING", description, chargeId, metadata } = params;

    const entry = await prisma.ledger.create({
      data: {
        merchantId,
        amount,
        type,
        status,
        description,
        chargeId,
        metadata: metadata ?? undefined,
      },
    });

    return entry;
  }

  /**
   * Retorna o saldo agrupado por status para um merchant.
   */
  async getBalance(merchantId: string): Promise<MerchantBalance> {
    const results = await prisma.ledger.groupBy({
      by: ["status"],
      where: { merchantId },
      _sum: { amount: true },
    });

    let pending = 0;
    let available = 0;
    let blocked = 0;

    for (const row of results) {
      const sum = row._sum.amount ?? 0;
      switch (row.status) {
        case "PENDING":
          pending = sum;
          break;
        case "AVAILABLE":
          available = sum;
          break;
        case "BLOCKED":
          blocked = sum;
          break;
      }
    }

    return {
      pending,
      available,
      blocked,
      total: pending + available + blocked,
    };
  }

  /**
   * Retorna o histórico de transações do merchant com paginação.
   * Para entradas CASH_IN, inclui feeAmount e netAmount com base na entrada FEE do mesmo chargeId.
   */
  async getTransactions(merchantId: string, opts: { page: number; limit: number; type?: LedgerType; status?: LedgerStatus }) {
    const { page, limit, type, status } = opts;

    const where = {
      merchantId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.ledger.count({ where }),
      prisma.ledger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Buscar as taxas (FEE) para as entradas CASH_IN retornadas
    const cashInChargeIds = transactions
      .filter((t) => t.type === "CASH_IN" && t.chargeId)
      .map((t) => t.chargeId as string);

    let feesByChargeId: Record<string, number> = {};

    if (cashInChargeIds.length > 0) {
      const fees = await prisma.ledger.findMany({
        where: {
          merchantId,
          type: "FEE",
          chargeId: { in: cashInChargeIds },
        },
        select: { chargeId: true, amount: true },
      });

      for (const fee of fees) {
        if (fee.chargeId) {
          feesByChargeId[fee.chargeId] = Math.abs(fee.amount);
        }
      }
    }

    const enrichedTransactions = transactions.map((t) => {
      if (t.type === "CASH_IN" && t.chargeId && feesByChargeId[t.chargeId] !== undefined) {
        const feeAmount = feesByChargeId[t.chargeId];
        return { ...t, feeAmount, netAmount: t.amount - feeAmount };
      }
      return { ...t, feeAmount: null, netAmount: null };
    });

    return { total, transactions: enrichedTransactions };
  }

  /**
   * Registra as transações de um pagamento PIX recebido (CashIn):
   * 1. CASH_IN com o valor bruto (o que o cliente pagou)
   * 2. FEE com o valor da taxa (negativo, saída da conta do merchant)
   *
   * Ambas entram como PENDING inicialmente.
   * Retorna os IDs para enfileirar a liquidação.
   */
  async recordPayment(params: {
    merchantId: string;
    chargeId: string;
    grossAmount: number;  // Valor total da cobrança em centavos
    feeAmount: number;    // Taxa da plataforma em centavos
    txid: string;
  }) {
    const { merchantId, chargeId, grossAmount, feeAmount, txid } = params;

    return prisma.$transaction(async (tx) => {
      const cashInEntry = await tx.ledger.create({
        data: {
          merchantId,
          amount: grossAmount,
          type: "CASH_IN",
          status: "PENDING",
          description: `Pagamento PIX recebido | txid: ${txid}`,
          chargeId,
          metadata: { txid, grossAmount, feeAmount },
        },
      });

      let feeEntry = null;
      if (feeAmount > 0) {
        feeEntry = await tx.ledger.create({
          data: {
            merchantId,
            amount: -feeAmount,
            type: "FEE",
            status: "PENDING",
            description: `Taxa da plataforma | txid: ${txid}`,
            chargeId,
            metadata: { txid, feeAmount },
          },
        });
      }

      return { cashInEntry, feeEntry };
    });
  }

  /**
   * Liquidação: move entradas PENDING de uma cobrança para AVAILABLE.
   * Chamado automaticamente pelo Settlement Worker após o delay configurado.
   */
  async liquidateByCharge(chargeId: string): Promise<number> {
    const result = await prisma.ledger.updateMany({
      where: {
        chargeId,
        status: "PENDING",
      },
      data: {
        status: "AVAILABLE",
      },
    });

    return result.count;
  }

  /**
   * Solicita saque do saldo disponível do merchant.
   *
   * 1. Verifica se o saldo AVAILABLE é suficiente
   * 2. Cria entrada WITHDRAW (negativa) com status AVAILABLE — deduz imediatamente
   * 3. Metadata armazena status do saque para integração com Transfeera
   */
  async requestWithdraw(params: {
    merchantId: string;
    amount: number;       // Valor em centavos (positivo) — valor liquido do merchant
    withdrawFee?: number; // Taxa de saque em centavos (0 = sem taxa)
    description?: string;
    pixKey?: string;
    pixKeyType?: string;
  }): Promise<WithdrawResult> {
    const { merchantId, amount, withdrawFee = 0, description, pixKey, pixKeyType } = params;
    const totalDebit = amount + withdrawFee;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        merchantId,
      );

      const results = await tx.ledger.groupBy({
        by: ["status"],
        where: { merchantId },
        _sum: { amount: true },
      });

      let available = 0;
      for (const row of results) {
        if (row.status === "AVAILABLE") available = row._sum.amount ?? 0;
      }

      if (available < totalDebit) {
        const needed = withdrawFee > 0
          ? `Solicitado: R$ ${(amount / 100).toFixed(2)} + taxa R$ ${(withdrawFee / 100).toFixed(2)}`
          : `Solicitado: R$ ${(amount / 100).toFixed(2)}`;
        return {
          success: false,
          message: `Saldo insuficiente. Disponível: R$ ${(available / 100).toFixed(2)}, ${needed}`,
        };
      }

      const entry = await tx.ledger.create({
        data: {
          merchantId,
          amount: -amount,
          type: "WITHDRAW",
          status: "AVAILABLE",
          description: description ?? `Saque solicitado | R$ ${(amount / 100).toFixed(2)}`,
          metadata: {
            requestedAmount: amount,
            withdrawFee,
            withdrawStatus: "REQUESTED",
            requestedAt: new Date().toISOString(),
            pixKey,
            pixKeyType,
          },
        },
      });

      if (withdrawFee > 0) {
        await tx.ledger.create({
          data: {
            merchantId,
            amount: -withdrawFee,
            type: "FEE",
            status: "AVAILABLE",
            description: `Taxa de saque | R$ ${(withdrawFee / 100).toFixed(2)}`,
            metadata: {
              relatedWithdrawId: entry.id,
              feeType: "WITHDRAW_FEE",
            },
          },
        });
      }

      return {
        success: true,
        ledgerEntry: entry,
        message: "Saque solicitado com sucesso",
      };
    });
  }

  /**
   * Reverte um saque falhado:
   * 1. Cria entrada ADJUSTMENT (positiva) para restaurar o saldo
   * 2. Atualiza metadata do WITHDRAW original para FAILED
   */
  async reverseWithdraw(withdrawEntryId: string, reason: string): Promise<void> {
    const withdrawEntry = await prisma.ledger.findUnique({
      where: { id: withdrawEntryId },
    });

    if (!withdrawEntry) throw new Error(`Ledger entry ${withdrawEntryId} não encontrada`);
    if (withdrawEntry.type !== "WITHDRAW") throw new Error(`Ledger entry ${withdrawEntryId} não é um saque`);

    const currentMeta = (withdrawEntry.metadata as Record<string, any>) ?? {};

    // Não reverter se já completado ou já revertido
    if (currentMeta.withdrawStatus === "COMPLETED") throw new Error("Saque já completado, não pode ser revertido");
    if (currentMeta.withdrawStatus === "FAILED") throw new Error("Saque já foi revertido");

    // Transaction atômica: ADJUSTMENT + update metadata do WITHDRAW
    await prisma.$transaction([
      prisma.ledger.create({
        data: {
          merchantId: withdrawEntry.merchantId,
          amount: Math.abs(withdrawEntry.amount), // Positivo = restaurar saldo
          type: "ADJUSTMENT",
          status: "AVAILABLE",
          description: `Estorno de saque falhado | ref: ${withdrawEntry.id.slice(0, 8)}`,
          metadata: {
            originalWithdrawId: withdrawEntry.id,
            reason,
            reversedAt: new Date().toISOString(),
          },
        },
      }),
      prisma.ledger.update({
        where: { id: withdrawEntry.id },
        data: {
          metadata: {
            ...currentMeta,
            withdrawStatus: "FAILED",
            failedAt: new Date().toISOString(),
            failReason: reason,
          },
        },
      }),
    ]);
  }
}

/** Singleton — use este ao invés de `new LedgerService()` */
export const ledgerService = new LedgerService();
