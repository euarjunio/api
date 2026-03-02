import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { prisma } from "../../../lib/prisma.ts";
import { env } from "../../../config/env.ts";
import { getProvider } from "../../../providers/acquirer.registry.ts";
import {
  statusMap,
  analysisStatusMap,
  situationTypeMap,
  refundStatusMap,
  refundAnalysisMap,
  normalizePixKeyStatus,
} from "../../../providers/transfeera/transfeera.maps.ts";
import { settlementQueue } from "../../../lib/queues/settlement-queue.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { findOrCreateCustomerFromPayer, notifyMerchant } from "./helpers.ts";
import { invalidateMerchantCaches, invalidate, CacheKeys } from "../../../lib/cache.ts";
import { dispatchTrackingEvent } from "../../../plugins/tracker.service.ts";

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutos

export const transfeeraHandlerRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/webhooks/transfeera
  app.post("/", {
    config: { rawBody: true },
    schema: {
      tags: ["Webhooks"],
      summary: "Webhook Transfeera",
      description: "Recebe notificações de eventos da Transfeera",
    },
  }, async (request, reply) => {
    const signatureHeader = request.headers["transfeera-signature"] as string | undefined;
    const secret = env.TRANSFEERA_WEBHOOK_SECRET;
    const provider = getProvider("transfeera");

    // ── 1. Verificação da assinatura (HMAC-SHA256) ──────────────
    if (secret) {
      if (!signatureHeader) {
        request.log.info("ℹ️  [WEBHOOK] Ping de verificação da Transfeera (sem assinatura) — respondendo 200");
        return reply.status(200).send({ received: true });
      }

      const parts = signatureHeader.split(",");
      const timestamp = parts.find(p => p.startsWith("t="))?.split("=")[1];
      const signature = parts.find(p => p.startsWith("v1="))?.split("=")[1];

      if (!timestamp || !signature) {
        request.log.warn("⚠️  [WEBHOOK] Formato de assinatura inválido");
        return reply.status(401).send({ message: "Invalid signature format" });
      }

      // Proteção contra replay attacks
      const ts = Number(timestamp);
      if (Math.abs(Date.now() - ts) > REPLAY_TOLERANCE_MS) {
        request.log.warn(`⚠️  [WEBHOOK] Timestamp expirado (${new Date(ts).toISOString()})`);
        return reply.status(401).send({ message: "Timestamp expired" });
      }

      // Validar HMAC-SHA256
      const rawBody = (request as any).rawBody as string;
      const signedPayload = `${timestamp}.${rawBody}`;

      if (!provider.verifyWebhookSignature(signedPayload, signature, secret)) {
        request.log.warn("❌  [WEBHOOK] Assinatura HMAC inválida");
        return reply.status(401).send({ message: "Invalid signature" });
      }
    }

    // ── 2. Processar evento ─────────────────────────────────────
    const body = request.body as any;
    const { object, data, account_id, id: eventId } = body;

    request.log.info(`📩  [WEBHOOK] Evento recebido: ${object} | eventId: ${eventId} | account: ${account_id}`);

    switch (object) {
      case "CashIn": {
        await handleCashIn(data, eventId, request);
        break;
      }

      case "Transfer": {
        await handleTransfer(data, eventId, request);
        break;
      }

      case "PixKey": {
        await handlePixKey(data, eventId, account_id, request);
        break;
      }

      case "CashInRefund": {
        await handleCashInRefund(data, eventId, account_id, request);
        break;
      }

      case "TransferRefund": {
        await handleTransferRefund(data, eventId, request);
        break;
      }

      case "Infraction": {
        await handleInfraction(data, eventId, account_id, request);
        break;
      }

      default: {
        request.log.warn(`❓  [WEBHOOK] Evento desconhecido: "${object}" | eventId: ${eventId}`);
        break;
      }
    }

    return reply.status(200).send({ received: true });
  });
};

// ── CashIn Handler ──────────────────────────────────────────────────
async function handleCashIn(data: any, eventId: string, request: any) {
  const { txid, value, end2end_id, pix_key, payer } = data;

  if (!txid) {
    request.log.warn(`💰  [CASHIN] PIX avulso (sem txid) | valor: R$${value} | e2e: ${end2end_id} | pix_key: ${pix_key}`);
    return;
  }

  request.log.info(`💰  [CASHIN] Pagamento recebido | txid: ${txid} | valor: R$${value} | e2e: ${end2end_id}`);

  // Buscar cobrança
  const charge = await prisma.charges.findUnique({
    where: { txid },
    include: {
      merchant: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
          document: true,
        },
      },
    },
  });

  if (!charge) {
    request.log.warn(`💰  [CASHIN] Cobrança não encontrada para txid: ${txid}`);
    return;
  }

  if (charge.status === "PAID") {
    request.log.info(`💰  [CASHIN] Cobrança já paga (duplicado) | chargeId: ${charge.id} | txid: ${txid}`);
    return;
  }

  // Criar/vincular customer com dados do pagador (se disponível)
  let customerId = charge.customerId;

  if (payer && payer.document) {
    customerId = await findOrCreateCustomerFromPayer(payer, request);
  }

  // Atualizar cobrança para PAID
  await prisma.charges.update({
    where: { id: charge.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      customerId,
      metadata: {
        ...(charge.metadata as object ?? {}),
        end2end_id,
        acquirer_cashin_id: data.id,
        payer,
      },
    },
  });

  // Registrar no ledger (livro razão)
  const feeAmount = charge.merchant.feeAmount ?? 0;
  const grossAmount = charge.amount;

  try {
    const { cashInEntry, feeEntry } = await ledgerService.recordPayment({
      merchantId: charge.merchantId,
      chargeId: charge.id,
      grossAmount,
      feeAmount,
      txid,
    });
    request.log.info(
      `📒  [LEDGER] Registrado | cashIn: ${cashInEntry.id} (R$${(grossAmount / 100).toFixed(2)}) | fee: ${feeEntry.id} (-R$${(feeAmount / 100).toFixed(2)})`
    );

    // Enfileirar liquidação automática (PENDING → AVAILABLE) com delay
    await settlementQueue.add(
      "settle",
      {
        chargeId: charge.id,
        merchantId: charge.merchantId,
        txid,
        grossAmount,
        feeAmount,
      },
      {
        delay: env.SETTLEMENT_DELAY_MS,
        jobId: `settle-${charge.id}`,
      },
    );
    request.log.info(
      `🏦  [SETTLEMENT] Job agendado | chargeId: ${charge.id} | delay: ${env.SETTLEMENT_DELAY_MS}ms`
    );
  } catch (err: any) {
    request.log.error(`📒  [LEDGER] Erro ao registrar transação: ${err?.message}`);
  }

  // Invalidar caches do merchant (balance, charges, transactions, withdrawals)
  await invalidateMerchantCaches(charge.merchantId);

  const payerName = payer?.name ?? "Desconhecido";
  const payerDoc = payer?.document ?? "N/A";
  request.log.info(
    `✅  [CASHIN] Cobrança PAGA | chargeId: ${charge.id} | txid: ${txid} | R$${value} | pagador: ${payerName} (${payerDoc})`
  );

  // Notificar merchant
  await notifyMerchant(charge.merchantId, "charge.paid", {
    chargeId: charge.id,
    txid,
    amount: charge.amount,
    paidAt: new Date().toISOString(),
    payer,
  }, request);

  // Push notification para o merchant
  try {
    const { notifications } = await import("../../../lib/notifications.ts");
    await notifications.chargePaid(charge.merchantId, {
      chargeId: charge.id,
      amount: charge.amount,
      txid,
      payerName: payer?.name,
    });
  } catch (err: any) {
    request.log.error(`🔔 [NOTIFICATION] Erro ao enviar notificação push: ${err?.message}`);
  }

  // Disparar eventos de tracking (UTMify, Meta Pixel, etc.)
  try {
    const trackingData = (charge.tracking as Record<string, any>) ?? {};
    const trackingCustomer = {
      name: charge.customer?.name ?? payer?.name ?? undefined,
      email: charge.customer?.email ?? undefined,
      phone: charge.customer?.phone ?? undefined,
      document: charge.customer?.document ?? payer?.document ?? undefined,
    };
    await dispatchTrackingEvent(charge.merchantId, "purchase", {
      chargeId: charge.id,
      txid,
      amount: charge.amount,
      paidAt: new Date().toISOString(),
      customer: Object.values(trackingCustomer).some(Boolean) ? trackingCustomer : undefined,
      tracking: Object.keys(trackingData).length > 0 ? trackingData : undefined,
    });
  } catch (err: any) {
    request.log.error(`🔌 [TRACKING] Erro ao disparar tracking: ${err?.message}`);
  }
}

// ── Transfer Handler ────────────────────────────────────────────────
async function handleTransfer(data: any, eventId: string, request: any) {
  const { id: transferId, status, value, idempotency_key, integration_id, destination_bank_account } = data;
  const destName = destination_bank_account?.name ?? "?";
  const destDoc = destination_bank_account?.cpf_cnpj ?? "?";

  request.log.info(
    `🔄  [TRANSFER] id: ${transferId} | status: ${status} | R$${value} | destino: ${destName} (${destDoc})`
  );

  // ── 1. Verificar se é uma transferência de SAQUE (via integration_id = ledger entry ID) ──
  if (integration_id) {
    const ledgerEntry = await prisma.ledger.findUnique({
      where: { id: integration_id },
    });

    if (ledgerEntry && ledgerEntry.type === "WITHDRAW") {
      await handleWithdrawTransfer(ledgerEntry, data, request);
      return;
    }
  }

  // ── 2. Verificar se é um split de cobrança (via idempotency_key) ──
  if (idempotency_key) {
    const txid = idempotency_key.split("-")[0];
    const charge = await prisma.charges.findUnique({ where: { txid } });

    if (charge) {
      await prisma.charges.update({
        where: { id: charge.id },
        data: {
          metadata: {
            ...(charge.metadata as object ?? {}),
            split_transfer_id: transferId,
            split_status: status,
          },
        },
      });
      request.log.info(
        `🔄  [TRANSFER] Split vinculado | chargeId: ${charge.id} | txid: ${txid} | status: ${status}`
      );
    }
  }
}

// ── Withdraw Transfer Handler ───────────────────────────────────────
async function handleWithdrawTransfer(ledgerEntry: any, data: any, request: any) {
  const { id: transferId, status, value, status_description } = data;
  const currentMeta = (ledgerEntry.metadata as Record<string, any>) ?? {};

  // Evitar processar se já foi completado ou revertido
  if (currentMeta.withdrawStatus === "COMPLETED" || currentMeta.withdrawStatus === "FAILED") {
    request.log.info(
      `💸  [WITHDRAW] Ignorando — saque já está ${currentMeta.withdrawStatus} | ledgerId: ${ledgerEntry.id}`
    );
    return;
  }

  const COMPLETED_STATUSES = ["FINALIZADO"];
  const FAILED_STATUSES = ["DEVOLVIDO", "FALHA", "ESTORNADO"];

  if (COMPLETED_STATUSES.includes(status)) {
    // ── Saque completado com sucesso ──
    await prisma.ledger.update({
      where: { id: ledgerEntry.id },
      data: {
        metadata: {
          ...currentMeta,
          withdrawStatus: "COMPLETED",
          transferId,
          completedAt: new Date().toISOString(),
          end2endId: data.pix_end2end_id ?? null,
          receiptUrl: data.receipt_url ?? null,
        },
      },
    });

    // Invalidar caches do merchant
    await invalidateMerchantCaches(ledgerEntry.merchantId);

    request.log.info(
      `💸  [WITHDRAW] ✅ Saque completado | ledgerId: ${ledgerEntry.id} | R$${value} | transferId: ${transferId}`
    );

    await notifyMerchant(ledgerEntry.merchantId, "withdraw.completed", {
      withdrawId: ledgerEntry.id,
      amount: Math.abs(ledgerEntry.amount),
      status: "COMPLETED",
      transferId,
      completedAt: new Date().toISOString(),
    }, request);

  } else if (FAILED_STATUSES.includes(status)) {
    // ── Saque falhado/devolvido — reverter saldo ──
    const reason = status_description ?? data.error ?? `Transfer ${status}`;

    try {
      await ledgerService.reverseWithdraw(ledgerEntry.id, reason);

      // Invalidar caches do merchant
      await invalidateMerchantCaches(ledgerEntry.merchantId);

      request.log.warn(
        `💸  [WITHDRAW] ❌ Saque revertido | ledgerId: ${ledgerEntry.id} | R$${value} | motivo: ${reason}`
      );

      await notifyMerchant(ledgerEntry.merchantId, "withdraw.failed", {
        withdrawId: ledgerEntry.id,
        amount: Math.abs(ledgerEntry.amount),
        status: "FAILED",
        reason,
      }, request);
    } catch (err: any) {
      request.log.error(
        `💸  [WITHDRAW] CRÍTICO — falha ao reverter saque | ledgerId: ${ledgerEntry.id} | erro: ${err?.message}`
      );
    }

  } else {
    // ── Status intermediário (PROCESSANDO, etc.) — só loga ──
    request.log.info(
      `💸  [WITHDRAW] Status intermediário | ledgerId: ${ledgerEntry.id} | status: ${status}`
    );
  }
}

// ── CashInRefund Handler (Estorno de PIX recebido) ──────────────────
async function handleCashInRefund(data: any, eventId: string, accountId: string, request: any) {
  const {
    id: refundId,
    status,
    value,
    end2end_id,
    cashin_id,
    reason,
    txid,
  } = data;

  request.log.info(
    `🔙  [CASHIN_REFUND] id: ${refundId} | status: ${status} | R$${value} | e2e: ${end2end_id ?? "N/A"} | txid: ${txid ?? "N/A"}`
  );

  // Buscar merchant pela conta do adquirente
  const merchant = await prisma.merchant.findFirst({
    where: { acquirerAccountId: accountId },
  });

  if (!merchant) {
    request.log.warn(`🔙  [CASHIN_REFUND] Merchant não encontrado para account_id: ${accountId}`);
    return;
  }

  // Buscar cobrança pelo txid
  let charge = null;
  if (txid) {
    charge = await prisma.charges.findUnique({ where: { txid } });
  }

  if (charge) {
    // Atualizar status da cobrança para REFUNDED
    await prisma.charges.update({
      where: { id: charge.id },
      data: {
        status: "REFUNDED",
        metadata: {
          ...(charge.metadata as object ?? {}),
          refund_id: refundId,
          refund_status: status,
          refund_value: value,
          refund_reason: reason ?? null,
          refund_end2end_id: end2end_id ?? null,
          refund_cashin_id: cashin_id ?? null,
        },
      },
    });

    // Registrar estorno no ledger
    const refundAmountCents = Math.round((parseFloat(value) || 0) * 100);
    if (refundAmountCents > 0) {
      try {
        await prisma.ledger.create({
          data: {
            amount: -refundAmountCents,
            type: "REFUND",
            status: "AVAILABLE",
            description: `Estorno PIX | txid: ${txid} | motivo: ${reason ?? "N/A"}`,
            merchantId: merchant.id,
            chargeId: charge.id,
          },
        });
        request.log.info(
          `📒  [LEDGER] Estorno registrado | chargeId: ${charge.id} | -R$${value}`
        );
      } catch (err: any) {
        request.log.error(`📒  [LEDGER] Erro ao registrar estorno: ${err?.message}`);
      }
    }

    request.log.info(
      `🔙  [CASHIN_REFUND] Cobrança estornada | chargeId: ${charge.id} | txid: ${txid} | R$${value}`
    );
  } else {
    request.log.warn(
      `🔙  [CASHIN_REFUND] Cobrança não encontrada para txid: ${txid ?? "N/A"} | refundId: ${refundId}`
    );
  }

  // Invalidar caches do merchant
  await invalidateMerchantCaches(merchant.id);

  // Notificar merchant
  await notifyMerchant(merchant.id, "charge.refunded", {
    refundId,
    txid: txid ?? null,
    chargeId: charge?.id ?? null,
    amount: value,
    status,
    reason: reason ?? null,
    end2endId: end2end_id ?? null,
  }, request);

  // Disparar evento de refund no tracking (UTMify)
  if (charge) {
    try {
      const trackingData = (charge.tracking as Record<string, any>) ?? {};
      await dispatchTrackingEvent(merchant.id, "refund", {
        chargeId: charge.id,
        txid: txid ?? charge.id,
        amount: Math.round((parseFloat(value) || 0) * 100),
        paidAt: new Date().toISOString(),
        tracking: Object.keys(trackingData).length > 0 ? trackingData : undefined,
      });
    } catch (err: any) {
      request.log.error(`🔌 [TRACKING] Erro ao disparar tracking refund: ${err?.message}`);
    }
  }
}

// ── TransferRefund Handler (Devolução de transferência/saque) ────────
async function handleTransferRefund(data: any, eventId: string, request: any) {
  const {
    id: refundId,
    status,
    value,
    transfer_id,
    end2end_id,
    reason,
    integration_id,
  } = data;

  request.log.info(
    `🔙  [TRANSFER_REFUND] id: ${refundId} | status: ${status} | R$${value} | transferId: ${transfer_id ?? "N/A"}`
  );

  // Buscar ledger entry pelo integration_id (se a transferência original tinha)
  if (integration_id) {
    const ledgerEntry = await prisma.ledger.findUnique({
      where: { id: integration_id },
    });

    if (ledgerEntry && ledgerEntry.type === "WITHDRAW") {
      const currentMeta = (ledgerEntry.metadata as Record<string, any>) ?? {};

      // Se o saque já foi revertido, ignorar
      if (currentMeta.withdrawStatus === "FAILED") {
        request.log.info(
          `🔙  [TRANSFER_REFUND] Saque já revertido | ledgerId: ${ledgerEntry.id}`
        );
        return;
      }

      try {
        await ledgerService.reverseWithdraw(
          ledgerEntry.id,
          `TransferRefund: ${reason ?? status}`,
        );

        // Invalidar caches do merchant
        await invalidateMerchantCaches(ledgerEntry.merchantId);

        request.log.warn(
          `🔙  [TRANSFER_REFUND] Saque revertido via refund | ledgerId: ${ledgerEntry.id} | R$${value}`
        );

        await notifyMerchant(ledgerEntry.merchantId, "withdraw.refunded", {
          withdrawId: ledgerEntry.id,
          refundId,
          amount: Math.abs(ledgerEntry.amount),
          status: "REFUNDED",
          reason: reason ?? null,
        }, request);
      } catch (err: any) {
        request.log.error(
          `🔙  [TRANSFER_REFUND] CRÍTICO — falha ao reverter | ledgerId: ${ledgerEntry.id} | erro: ${err?.message}`
        );
      }
      return;
    }
  }

  // Se não encontrou pelo integration_id, loga apenas como informação
  request.log.info(
    `🔙  [TRANSFER_REFUND] Refund genérico | refundId: ${refundId} | transferId: ${transfer_id ?? "N/A"} | R$${value} | reason: ${reason ?? "N/A"}`
  );
}

// ── Infraction Handler (MED — Mecanismo Especial de Devolução) ──────
async function handleInfraction(data: any, eventId: string, accountId: string, request: any) {
  const {
    id: acquirerInfractionId,
    status,
    analysis_status,
    analysis_due_date,
    analysis_date,
    analysis_description,
    situation_type,
    transaction_id,
    amount,
    infraction_date,
    infraction_description,
    payer_name,
    payer_tax_id,
    contested_at,
    refund,
    user: reviewerUser,
    txid,
  } = data;

  request.log.info(
    `⚠️  [INFRACTION] Recebida | id: ${acquirerInfractionId} | status: ${status} | analysis: ${analysis_status} | tipo: ${situation_type} | amount: ${amount} | txid: ${txid ?? "N/A"}`
  );

  // 1. Buscar merchant pela conta do adquirente
  const merchant = await prisma.merchant.findFirst({
    where: { acquirerAccountId: accountId },
  });

  if (!merchant) {
    request.log.warn(`⚠️  [INFRACTION] Merchant não encontrado para account_id: ${accountId}`);
    return;
  }

  // 2. Buscar cobrança pelo txid (se existir) para vincular
  let chargeId: string | null = null;
  if (txid) {
    const charge = await prisma.charges.findUnique({ where: { txid } });
    if (charge) chargeId = charge.id;
  }

  // 3. Mapear status do adquirente → enums do Prisma (usando maps centralizados)
  const mappedStatus = statusMap[status] ?? "PENDING";
  const mappedAnalysis = analysisStatusMap[analysis_status] ?? "PENDING";
  const mappedSituation = situationTypeMap[situation_type] ?? "UNKNOWN";

  // 4. Upsert infração (pode receber atualizações do mesmo ID)
  const existing = await prisma.infraction.findUnique({
    where: { acquirerInfractionId },
  });

  const infractionData: any = {
    acquirerEventId: eventId,
    acquirerAccountId: accountId,
    status: mappedStatus,
    situationType: mappedSituation,
    transactionId: transaction_id ?? null,
    txid: txid ?? null,
    amount: amount ?? 0,
    infractionDate: infraction_date ? new Date(infraction_date) : new Date(),
    analysisDueDate: analysis_due_date ? new Date(analysis_due_date) : null,
    analysisDate: analysis_date ? new Date(analysis_date) : null,
    infractionDescription: infraction_description ?? null,
    payerName: payer_name ?? null,
    payerTaxId: payer_tax_id ?? null,
    contestedAt: contested_at ? new Date(contested_at) : null,
    reviewerName: reviewerUser?.name ?? null,
    chargeId,
    merchantId: merchant.id,
  };

  // Atualizar analysisStatus apenas se NÃO estiver AWAITING_APPROVAL (preservar fluxo híbrido)
  if (!existing || existing.analysisStatus !== "AWAITING_APPROVAL") {
    infractionData.analysisStatus = mappedAnalysis;
  }

  // Mapear refund data
  if (refund) {
    if (refund.status) infractionData.refundStatus = refundStatusMap[refund.status] ?? null;
    if (refund.analysis_status) infractionData.refundAnalysisStatus = refundAnalysisMap[refund.analysis_status] ?? null;
    infractionData.refundTransactionId = refund.transaction_id ?? null;
    infractionData.refundedAmount = refund.refunded_amount ?? null;
    infractionData.refundDate = refund.refund_date ? new Date(refund.refund_date) : null;
    infractionData.refundRejectionReason = refund.rejection_reason ?? null;
  }

  if (existing) {
    await prisma.infraction.update({
      where: { acquirerInfractionId },
      data: infractionData,
    });
    request.log.info(
      `⚠️  [INFRACTION] Atualizada | id: ${existing.id} | acquirer: ${acquirerInfractionId} | status: ${mappedStatus} | analysis: ${mappedAnalysis}`
    );
  } else {
    const infraction = await prisma.infraction.create({
      data: {
        acquirerInfractionId,
        acquirer: "transfeera",
        ...infractionData,
      },
    });
    request.log.info(
      `⚠️  [INFRACTION] Nova criada | id: ${infraction.id} | acquirer: ${acquirerInfractionId} | merchant: ${merchant.id}`
    );
  }

  // 5. Determinar evento de notificação
  let webhookEvent = "infraction.received";
  if (existing) {
    webhookEvent = "infraction.updated";
    if (refund?.status === "closed") {
      webhookEvent = "infraction.refund_completed";
    }
  }

  // 6. Notificar merchant
  await notifyMerchant(merchant.id, webhookEvent, {
    infractionId: acquirerInfractionId,
    status: mappedStatus,
    analysisStatus: mappedAnalysis,
    situationType: mappedSituation,
    amount,
    txid: txid ?? null,
    transactionId: transaction_id ?? null,
    payerName: payer_name ?? null,
    analysisDueDate: analysis_due_date ?? null,
    refund: refund ?? null,
  }, request);
}

// ── PixKey Handler ───────────────────────────────────────────────────
async function handlePixKey(data: any, eventId: string, accountId: string, request: any) {
  const { id: keyId, key, type, status } = data;

  request.log.info(
    `🔑  [PIXKEY] Evento recebido | eventId: ${eventId} | keyId: ${keyId ?? "?"} | status: ${status ?? "?"} | key: ${key ?? "?"}`
  );

  if (!keyId) {
    request.log.warn(`🔑  [PIXKEY] Evento sem keyId — ignorando`);
    return;
  }

  // Buscar merchant pelo pixKeyId (principal) ou acquirerAccountId (fallback)
  let merchant = await prisma.merchant.findFirst({
    where: { pixKeyId: keyId },
  });

  if (!merchant && accountId) {
    merchant = await prisma.merchant.findFirst({
      where: { acquirerAccountId: accountId },
    });
  }

  if (!merchant) {
    request.log.warn(`🔑  [PIXKEY] Merchant não encontrado para keyId: ${keyId} | accountId: ${accountId}`);
    return;
  }

  // Atualizar dados da chave PIX no merchant
  const updateData: any = {};

  if (keyId && merchant.pixKeyId !== keyId) {
    updateData.pixKeyId = keyId;
  }
  // Normalizar status (PT → EN)
  const normalizedStatus = normalizePixKeyStatus(status);
  if (normalizedStatus && normalizedStatus !== merchant.pixKeyStatus) {
    updateData.pixKeyStatus = normalizedStatus;
  }
  if (key !== undefined && key !== merchant.pixKey) {
    updateData.pixKey = key;
  }
  if (type && type !== merchant.pixKeyType) {
    updateData.pixKeyType = type;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: updateData,
    });

    request.log.info(
      `🔑  [PIXKEY] Merchant atualizado | merchantId: ${merchant.id} | status: ${status} | key: ${key ?? "(pendente)"}`
    );
  } else {
    request.log.info(`🔑  [PIXKEY] Sem alterações para merchantId: ${merchant.id}`);
  }

  // Notificar merchant via webhook (se configurado)
  await notifyMerchant(merchant.id, "pixkey.updated", {
    keyId,
    key: key ?? null,
    type: type ?? null,
    status: status ?? null,
  }, request);
}
