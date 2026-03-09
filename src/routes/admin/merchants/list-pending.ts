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
      querystring: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
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
          total: z.number(),
          page: z.number(),
          limit: z.number(),
        }),
      },
    },
  }, async (request, reply) => {
    const { page, limit } = request.query;

    const [total, merchants] = await Promise.all([
      prisma.merchant.count({ where: { kycStatus: "UNDER_REVIEW" } }),
      prisma.merchant.findMany({
        where: { kycStatus: "UNDER_REVIEW" },
        select: {
          id: true, name: true, email: true, phone: true,
          document: true, documentType: true, kycStatus: true, createdAt: true,
          docFrontUrl: true, docBackUrl: true, docSelfieUrl: true,
        },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const merchantsWithUrls = await Promise.all(
      merchants.map(async (m) => {
        const [docFrontUrl, docBackUrl, docSelfieUrl] = await Promise.all([
          m.docFrontUrl ? storageService.getFileUrl(m.docFrontUrl) : null,
          m.docBackUrl ? storageService.getFileUrl(m.docBackUrl) : null,
          m.docSelfieUrl ? storageService.getFileUrl(m.docSelfieUrl) : null,
        ]);
        return {
          id: m.id, name: m.name, email: m.email, phone: m.phone,
          document: m.document, documentType: m.documentType,
          kycStatus: m.kycStatus, createdAt: m.createdAt.toISOString(),
          docFrontUrl, docBackUrl, docSelfieUrl,
        };
      })
    );

    return reply.status(200).send({ merchants: merchantsWithUrls, total, page, limit });
  });
};
