import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";

export const getAdminInfractionRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/:id",
    {
      schema: {
        tags: ["Admin - Infractions"],
        summary: "Detalhe de uma infração (admin)",
        description: "Retorna todos os dados da infração, incluindo análise do merchant e dados de refund.",
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: z.object({
            infraction: z.object({
              id: z.string(),
              acquirer: z.string(),
              acquirerInfractionId: z.string(),
              acquirerEventId: z.string().nullable(),
              acquirerAccountId: z.string().nullable(),
              status: z.string(),
              analysisStatus: z.string(),
              situationType: z.string(),
              transactionId: z.string().nullable(),
              txid: z.string().nullable(),
              amount: z.number(),
              infractionDate: z.string(),
              analysisDueDate: z.string().nullable(),
              analysisDate: z.string().nullable(),
              infractionDescription: z.string().nullable(),
              payerName: z.string().nullable(),
              payerTaxId: z.string().nullable(),
              contestedAt: z.string().nullable(),
              merchantAnalysis: z.string().nullable(),
              merchantDescription: z.string().nullable(),
              merchantAnalyzedAt: z.string().nullable(),
              adminApprovedBy: z.string().nullable(),
              adminNotes: z.string().nullable(),
              adminApprovedAt: z.string().nullable(),
              sentAnalysis: z.string().nullable(),
              sentDescription: z.string().nullable(),
              sentAt: z.string().nullable(),
              refund: z.object({
                status: z.string().nullable(),
                analysisStatus: z.string().nullable(),
                transactionId: z.string().nullable(),
                refundedAmount: z.number().nullable(),
                refundDate: z.string().nullable(),
                rejectionReason: z.string().nullable(),
              }),
              reviewerName: z.string().nullable(),
              chargeId: z.string().nullable(),
              merchant: z.object({
                id: z.string(),
                name: z.string(),
                document: z.string(),
                email: z.string(),
              }),
              createdAt: z.string(),
              updatedAt: z.string(),
            }),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const infraction = await prisma.infraction.findUnique({
        where: { id },
        include: {
          merchant: {
            select: { id: true, name: true, document: true, email: true },
          },
        },
      });

      if (!infraction) {
        return reply.status(404).send({ message: "Infração não encontrada" });
      }

      return reply.send({
        infraction: {
          id: infraction.id,
          acquirer: infraction.acquirer,
          acquirerInfractionId: infraction.acquirerInfractionId,
          acquirerEventId: infraction.acquirerEventId,
          acquirerAccountId: infraction.acquirerAccountId,
          status: infraction.status,
          analysisStatus: infraction.analysisStatus,
          situationType: infraction.situationType,
          transactionId: infraction.transactionId,
          txid: infraction.txid,
          amount: infraction.amount,
          infractionDate: infraction.infractionDate.toISOString(),
          analysisDueDate: infraction.analysisDueDate?.toISOString() ?? null,
          analysisDate: infraction.analysisDate?.toISOString() ?? null,
          infractionDescription: infraction.infractionDescription,
          payerName: infraction.payerName,
          payerTaxId: infraction.payerTaxId,
          contestedAt: infraction.contestedAt?.toISOString() ?? null,
          merchantAnalysis: infraction.merchantAnalysis,
          merchantDescription: infraction.merchantDescription,
          merchantAnalyzedAt: infraction.merchantAnalyzedAt?.toISOString() ?? null,
          adminApprovedBy: infraction.adminApprovedBy,
          adminNotes: infraction.adminNotes,
          adminApprovedAt: infraction.adminApprovedAt?.toISOString() ?? null,
          sentAnalysis: infraction.sentAnalysis,
          sentDescription: infraction.sentDescription,
          sentAt: infraction.sentAt?.toISOString() ?? null,
          refund: {
            status: infraction.refundStatus,
            analysisStatus: infraction.refundAnalysisStatus,
            transactionId: infraction.refundTransactionId,
            refundedAmount: infraction.refundedAmount,
            refundDate: infraction.refundDate?.toISOString() ?? null,
            rejectionReason: infraction.refundRejectionReason,
          },
          reviewerName: infraction.reviewerName,
          chargeId: infraction.chargeId,
          merchant: infraction.merchant,
          createdAt: infraction.createdAt.toISOString(),
          updatedAt: infraction.updatedAt.toISOString(),
        },
      });
    },
  );
};
