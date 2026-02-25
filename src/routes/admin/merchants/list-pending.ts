import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { storageService } from "../../../services/storage.service.ts";

export const listPendingKycRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/admin/merchants/pending-kyc
  app.get("/pending-kyc", {
    schema: {
      tags: ["Admin"],
      summary: "Listar merchants pendentes de KYC",
      description: "Retorna todos os merchants com status UNDER_REVIEW",
      response: {
        200: z.object({
          merchants: z.array(z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            phone: z.string(),
            document: z.string(),
            documentType: z.string(),
            kycStatus: z.string(),
            createdAt: z.string().datetime(),
            docFrontUrl: z.string().nullable(),
            docBackUrl: z.string().nullable(),
            docSelfieUrl: z.string().nullable(),
          })),
        }),
      },
    },
  }, async (request, reply) => {
    const merchants = await prisma.merchant.findMany({
      where: { kycStatus: "UNDER_REVIEW" },
    });

    const merchantsWithUrls = await Promise.all(
      merchants.map(async (m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        document: m.document,
        documentType: m.documentType,
        kycStatus: m.kycStatus,
        createdAt: m.createdAt.toISOString(),
        docFrontUrl: m.docFrontUrl ? await storageService.getFileUrl(m.docFrontUrl) : null,
        docBackUrl: m.docBackUrl ? await storageService.getFileUrl(m.docBackUrl) : null,
        docSelfieUrl: m.docSelfieUrl ? await storageService.getFileUrl(m.docSelfieUrl) : null,
      }))
    );

    return reply.status(200).send({ merchants: merchantsWithUrls });
  });
};
