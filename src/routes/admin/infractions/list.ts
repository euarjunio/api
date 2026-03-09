import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const listAdminInfractionsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["Admin - Infractions"],
        summary: "Listar todas as infrações",
        description: "Lista todas as infrações PIX (MED) de todos os merchants. Filtros opcionais.",
        querystring: z.object({
          status: z.enum(["PENDING", "AGREED", "DISAGREED", "CANCELED"]).optional(),
          analysisStatus: z
            .enum(["PENDING", "AWAITING_APPROVAL", "ACCEPTED", "REJECTED", "DELAYED", "CANCELED"])
            .optional(),
          merchantId: z.string().uuid().optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
        response: {
          200: z.object({
            infractions: z.array(
              z.object({
                id: z.string(),
                acquirerInfractionId: z.string(),
                status: z.string(),
                analysisStatus: z.string(),
                situationType: z.string(),
                amount: z.number(),
                txid: z.string().nullable(),
                transactionId: z.string().nullable(),
                payerName: z.string().nullable(),
                payerTaxId: z.string().nullable(),
                infractionDate: z.string(),
                analysisDueDate: z.string().nullable(),
                merchantAnalysis: z.string().nullable(),
                merchantDescription: z.string().nullable(),
                merchantAnalyzedAt: z.string().nullable(),
                merchant: z.object({
                  id: z.string(),
                  name: z.string(),
                  document: z.string(),
                }),
                createdAt: z.string(),
              }),
            ),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { status, analysisStatus, merchantId, page, limit } = request.query;

      const where: any = {};
      if (status) where.status = status;
      if (analysisStatus) where.analysisStatus = analysisStatus;
      if (merchantId) where.merchantId = merchantId;

      const [infractions, total] = await Promise.all([
        prisma.infraction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true, acquirerInfractionId: true, status: true,
            analysisStatus: true, situationType: true, amount: true,
            txid: true, transactionId: true, payerName: true, payerTaxId: true,
            infractionDate: true, analysisDueDate: true,
            merchantAnalysis: true, merchantDescription: true, merchantAnalyzedAt: true,
            createdAt: true,
            merchant: { select: { id: true, name: true, document: true } },
          },
        }),
        prisma.infraction.count({ where }),
      ]);

      return reply.send({
        infractions: infractions.map((i) => ({
          id: i.id,
          acquirerInfractionId: i.acquirerInfractionId,
          status: i.status,
          analysisStatus: i.analysisStatus,
          situationType: i.situationType,
          amount: i.amount,
          txid: i.txid,
          transactionId: i.transactionId,
          payerName: i.payerName,
          payerTaxId: i.payerTaxId,
          infractionDate: i.infractionDate.toISOString(),
          analysisDueDate: i.analysisDueDate?.toISOString() ?? null,
          merchantAnalysis: i.merchantAnalysis,
          merchantDescription: i.merchantDescription,
          merchantAnalyzedAt: i.merchantAnalyzedAt?.toISOString() ?? null,
          merchant: i.merchant,
          createdAt: i.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
      });
    },
  );
};
