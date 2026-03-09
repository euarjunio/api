import { prisma } from "../lib/prisma.ts";
import { acquirerService } from "./acquirer.service.ts";
import { queueEmail } from "../lib/queues/email-queue.ts";
import { merchantApprovedEmail, merchantRejectedEmail } from "../lib/email-templates.ts";

type MerchantActionResult =
  | { ok: true; message: string; extra?: Record<string, unknown> }
  | { ok: false; status: 400 | 404; message: string };

export async function approveMerchant(
  merchantId: string,
  log: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void; error: (obj: unknown, msg: string) => void },
): Promise<MerchantActionResult> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { user: { select: { email: true } } },
  });

  if (!merchant) return { ok: false, status: 404, message: "Merchant não encontrado" };
  if (merchant.kycStatus === "APPROVED") return { ok: false, status: 400, message: "Merchant já aprovado." };

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { kycStatus: "APPROVED", kycAnalyzedAt: new Date() },
  });

  try {
    await queueEmail({ to: merchant.user.email, ...merchantApprovedEmail(merchant.name) });
  } catch (emailErr: any) {
    log.warn({ error: emailErr?.message, merchantId }, "Failed to queue merchant approved email");
  }

  try {
    const result = await acquirerService.setupMerchantAccount(merchantId);
    return {
      ok: true,
      message: "Merchant aprovado e conta no adquirente criada. O merchant deve cadastrar sua chave PIX.",
      extra: { acquirerAccountId: result.accountId },
    };
  } catch (error: any) {
    log.error({ error: error.message, merchantId }, "Erro ao criar conta no adquirente");
    return {
      ok: true,
      message: "Merchant aprovado, mas houve erro ao criar conta no adquirente. Use /setup-acquirer.",
      extra: { error: error.message },
    };
  }
}

export async function rejectMerchant(
  merchantId: string,
  reason: string,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<MerchantActionResult> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { user: { select: { email: true } } },
  });

  if (!merchant) return { ok: false, status: 404, message: "Merchant não encontrado" };

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { kycStatus: "REJECTED", kycNotes: reason, kycAnalyzedAt: new Date() },
  });

  try {
    await queueEmail({ to: merchant.user.email, ...merchantRejectedEmail(merchant.name, reason) });
  } catch (emailErr: any) {
    log.warn({ error: emailErr?.message, merchantId }, "Failed to queue merchant rejected email");
  }

  return { ok: true, message: "Merchant rejeitado." };
}

export async function blockMerchant(
  merchantId: string,
  reason: string,
): Promise<MerchantActionResult> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });

  if (!merchant) return { ok: false, status: 404, message: "Merchant não encontrado" };
  if (merchant.status === "INACTIVE") return { ok: false, status: 400, message: "Merchant já está bloqueado." };

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      status: "INACTIVE",
      metadata: {
        ...(merchant.metadata as object ?? {}),
        blockedAt: new Date().toISOString(),
        blockedReason: reason,
      },
    },
  });

  await prisma.apikey.updateMany({
    where: { merchantId, status: "ACTIVE" },
    data: { status: "INACTIVE" },
  });

  return { ok: true, message: "Merchant bloqueado com sucesso." };
}
