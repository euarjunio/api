import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { storageService } from "../../../services/storage.service.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { normalizePixKeyStatus } from "../../../providers/transfeera/transfeera.maps.ts";

export const getMerchantDetailRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/admin/merchants/:id
  app.get("/:id", {
    schema: {
      tags: ["Admin"],
      summary: "Detalhe do merchant",
      description: "Retorna os dados completos de um merchant, incluindo saldo e documentos KYC.",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            phone: z.string(),
            document: z.string(),
            documentType: z.string(),
            status: z.string(),
            kycStatus: z.string(),
            kycNotes: z.string().nullable(),
            kycAnalyzedAt: z.string().datetime().nullable(),
            feeMode: z.string(),
            feeAmount: z.number(),
            pixKey: z.string().nullable(),
            pixKeyType: z.string().nullable(),
            pixKeyStatus: z.string().nullable(),
            acquirer: z.string(),
            acquirerAccountId: z.string().nullable(),
            twoFactorEnabled: z.boolean(),
            docFrontUrl: z.string().nullable(),
            docBackUrl: z.string().nullable(),
            docSelfieUrl: z.string().nullable(),
            createdAt: z.string().datetime(),
          }),
          balance: z.object({
            pending: z.number(),
            available: z.number(),
            blocked: z.number(),
            total: z.number(),
          }),
          stats: z.object({
            totalCharges: z.number(),
            paidCharges: z.number(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: { user: { select: { twoFactorEnabled: true } } },
    });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    const [balance, totalCharges, paidCharges] = await Promise.all([
      ledgerService.getBalance(id),
      prisma.charges.count({ where: { merchantId: id } }),
      prisma.charges.count({ where: { merchantId: id, status: "PAID" } }),
    ]);

    return reply.status(200).send({
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        phone: merchant.phone,
        document: merchant.document,
        documentType: merchant.documentType,
        status: merchant.status,
        kycStatus: merchant.kycStatus,
        kycNotes: merchant.kycNotes,
        kycAnalyzedAt: merchant.kycAnalyzedAt?.toISOString() ?? null,
        feeMode: merchant.feeMode,
        feeAmount: merchant.feeAmount,
        pixKey: merchant.pixKey,
        pixKeyType: merchant.pixKeyType,
        pixKeyStatus: normalizePixKeyStatus(merchant.pixKeyStatus),
        acquirer: merchant.acquirer,
        acquirerAccountId: merchant.acquirerAccountId,
        twoFactorEnabled: merchant.user.twoFactorEnabled,
        docFrontUrl: merchant.docFrontUrl ? await storageService.getFileUrl(merchant.docFrontUrl) : null,
        docBackUrl: merchant.docBackUrl ? await storageService.getFileUrl(merchant.docBackUrl) : null,
        docSelfieUrl: merchant.docSelfieUrl ? await storageService.getFileUrl(merchant.docSelfieUrl) : null,
        createdAt: merchant.createdAt.toISOString(),
      },
      balance,
      stats: {
        totalCharges,
        paidCharges,
      },
    });
  });
};
