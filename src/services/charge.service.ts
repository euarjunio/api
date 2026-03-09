import type { Prisma } from "../lib/generated/prisma/client.ts";
import type { FeeMode } from "../lib/generated/prisma/enums.ts";
import { prisma } from "../lib/prisma.ts";
import { getProviderForMerchant } from "../providers/acquirer.registry.ts";
import { isPixKeyActive } from "../providers/transfeera/transfeera.maps.ts";
import { getDocumentType, normalizeDocument } from "../utils/br-document.ts";

type MerchantForCharge = {
  id: string;
  status: string;
  kycStatus: string;
  acquirer: string;
  acquirerAccountId: string | null;
  pixKey: string | null;
  pixKeyId: string | null;
  pixKeyStatus: string | null;
  feeMode: FeeMode;
  feeAmount: number;
  minTicketAmount: number;
  maxTicketAmount: number;
};

type ValidateChargeResult =
  | { ok: true; merchant: MerchantForCharge }
  | { ok: false; status: 400 | 403 | 404; message: string };

export async function validateMerchantForCharge(userId: string, amount: number): Promise<ValidateChargeResult> {
  const merchant = await prisma.merchant.findUnique({
    where: { userId },
    select: {
      id: true, status: true, kycStatus: true,
      acquirer: true, acquirerAccountId: true,
      pixKey: true, pixKeyId: true, pixKeyStatus: true,
      feeMode: true, feeAmount: true,
      minTicketAmount: true, maxTicketAmount: true,
    },
  });

  if (!merchant) return { ok: false, status: 404, message: "Merchant não encontrado" };

  if (merchant.minTicketAmount > 0 && amount < merchant.minTicketAmount) {
    return { ok: false, status: 400, message: `Valor mínimo por cobrança: R$ ${(merchant.minTicketAmount / 100).toFixed(2)}` };
  }
  if (merchant.maxTicketAmount > 0 && amount > merchant.maxTicketAmount) {
    return { ok: false, status: 400, message: `Valor máximo por cobrança: R$ ${(merchant.maxTicketAmount / 100).toFixed(2)}` };
  }
  if (merchant.kycStatus !== "APPROVED") {
    return { ok: false, status: 403, message: "Sua conta ainda não foi aprovada pelo compliance. Envie seus documentos." };
  }
  if (!merchant.acquirerAccountId) {
    return { ok: false, status: 403, message: "Conta do adquirente não configurada. Aguarde a ativação pelo administrador." };
  }
  if (!merchant.pixKey || !merchant.pixKeyId) {
    return { ok: false, status: 403, message: "Chave PIX não cadastrada. Cadastre uma chave PIX antes de criar cobranças." };
  }
  if (!isPixKeyActive(merchant.pixKeyStatus)) {
    return { ok: false, status: 403, message: "Sua chave PIX ainda não está ativa. Aguarde a ativação para criar cobranças." };
  }

  return { ok: true, merchant };
}

export async function checkIdempotency(merchantId: string, idempotencyKey: string | null) {
  if (!idempotencyKey) return null;

  const existing = await prisma.charges.findUnique({
    where: { merchantId_idempotencyKey: { merchantId, idempotencyKey } },
    include: { customer: { select: { id: true, name: true, document: true } } },
  });

  return existing;
}

type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  document: string;
};

type ResolvedCustomer = { id: string; name: string; document: string };

type ResolveCustomerResult =
  | { ok: true; customer: ResolvedCustomer; payer: { name: string; document: string } }
  | { ok: false; message: string };

export async function resolveCustomer(merchantId: string, data: CustomerInput): Promise<ResolveCustomerResult> {
  const doc = normalizeDocument(data.document);
  const docType = getDocumentType(doc);

  if (!docType) {
    return { ok: false, message: "Documento do pagador não é um CPF nem CNPJ válido" };
  }

  let dbCustomer = await prisma.customer.findFirst({
    where: {
      merchantId,
      OR: [
        { document: doc },
        ...(data.email ? [{ email: data.email }] : []),
      ],
    },
  });

  if (!dbCustomer) {
    dbCustomer = await prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        document: doc,
        documentType: docType,
        merchantId,
      },
    });
  }

  return {
    ok: true,
    customer: { id: dbCustomer.id, name: dbCustomer.name, document: dbCustomer.document },
    payer: { name: dbCustomer.name, document: dbCustomer.document },
  };
}

type CreateChargeParams = {
  merchant: MerchantForCharge;
  amount: number;
  description: string;
  expiresIn: number;
  idempotencyKey: string | null;
  customer: ResolvedCustomer | null;
  payer?: { name: string; document: string };
  tracking?: Prisma.InputJsonValue;
};

type CreateChargeResult = {
  charge: {
    id: string;
    txid: string | null;
    qrCode: string | null;
    imageBase64: string | null;
    amount: number;
    status: string;
    expiresIn: number;
  };
};

export async function createChargeOnAcquirer(params: CreateChargeParams): Promise<CreateChargeResult> {
  const { merchant, amount, description, expiresIn, idempotencyKey, customer, payer, tracking } = params;

  let charge;
  try {
    charge = await prisma.charges.create({
      data: {
        amount,
        description,
        status: "PENDING",
        acquirer: merchant.acquirer,
        paymentMethod: "PIX",
        expiresIn,
        idempotencyKey,
        merchantId: merchant.id,
        customerId: customer?.id ?? null,
        tracking: tracking ?? undefined,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002" && idempotencyKey) {
      const existing = await prisma.charges.findUnique({
        where: { merchantId_idempotencyKey: { merchantId: merchant.id, idempotencyKey } },
        include: { customer: { select: { id: true, name: true, document: true } } },
      });
      if (existing) {
        return {
          charge: {
            id: existing.id,
            txid: existing.txid,
            qrCode: existing.qrCode,
            imageBase64: null,
            amount: existing.amount,
            status: existing.status,
            expiresIn: existing.expiresIn,
          },
        };
      }
    }
    throw err;
  }

  const provider = await getProviderForMerchant(merchant.id);
  const merchantToken = await provider.getMerchantToken(merchant.acquirerAccountId!);

  let chargeResult;
  try {
    chargeResult = await provider.createCharge(merchantToken, {
      pixKey: merchant.pixKey!,
      amount,
      description,
      expiresIn,
      payer,
      splitPayment: merchant.feeAmount > 0
        ? { mode: merchant.feeMode, amount: merchant.feeAmount }
        : undefined,
    });
  } catch (err) {
    await prisma.charges.delete({ where: { id: charge.id } }).catch(() => {});
    throw err;
  }

  charge = await prisma.charges.update({
    where: { id: charge.id },
    data: { txid: chargeResult.txid, qrCode: chargeResult.emvPayload },
  });

  return {
    charge: {
      id: charge.id,
      txid: charge.txid,
      qrCode: charge.qrCode,
      imageBase64: chargeResult.imageBase64 ?? null,
      amount: charge.amount,
      status: charge.status,
      expiresIn: charge.expiresIn,
    },
  };
}
