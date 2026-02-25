import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { getDefaultProvider } from "../../../providers/acquirer.registry.ts";
import {
  statusMap,
  analysisStatusMap,
  situationTypeMap,
  refundStatusMap,
  refundAnalysisMap,
} from "../../../providers/transfeera/transfeera.maps.ts";

export const syncInfractionsRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sync",
    {
      schema: {
        tags: ["Admin - Infractions"],
        summary: "Sincronizar infrações com o adquirente",
        description:
          "Puxa as infrações da API do adquirente e " +
          "cria/atualiza no banco local. Útil para recuperar infrações que " +
          "o webhook possa ter perdido.",
        querystring: z.object({
          infraction_date__gte: z.string().optional(),
          infraction_date__lte: z.string().optional(),
          analysis_status__in: z.string().optional(),
          page_size: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: {
          200: z.object({
            message: z.string(),
            created: z.number(),
            updated: z.number(),
            total: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const filters = request.query;

      const provider = getDefaultProvider();
      const token = await provider.getAdminToken();
      const result = await provider.getInfractions(token, filters);

      let created = 0;
      let updated = 0;

      for (const item of result.items) {
        // Tentar encontrar o merchant pela transaction_id (e2e) ou por outras informações
        let merchantId: string | null = null;
        let chargeId: string | null = null;

        if (item.txid) {
          const charge = await prisma.charges.findUnique({
            where: { txid: item.txid },
            select: { id: true, merchantId: true },
          });
          if (charge) {
            merchantId = charge.merchantId;
            chargeId = charge.id;
          }
        }

        // Se não encontrou por txid, tenta pelo transaction_id (e2e) no metadata das charges
        if (!merchantId && item.transaction_id) {
          const charge = await prisma.charges.findFirst({
            where: {
              metadata: { path: ["end2end_id"], equals: item.transaction_id },
            },
            select: { id: true, merchantId: true },
          });
          if (charge) {
            merchantId = charge.merchantId;
            chargeId = charge.id;
          }
        }

        if (!merchantId) {
          request.log.warn(
            `⚠️  [SYNC] Não foi possível vincular infração ${item.id} a nenhum merchant`,
          );
          continue;
        }

        const existing = await prisma.infraction.findUnique({
          where: { acquirerInfractionId: item.id },
        });

        const data: any = {
          status: statusMap[item.status] ?? "PENDING",
          situationType: situationTypeMap[item.situation_type] ?? "UNKNOWN",
          transactionId: item.transaction_id ?? null,
          txid: item.txid ?? null,
          amount: item.amount ?? 0,
          infractionDate: item.infraction_date ? new Date(item.infraction_date) : new Date(),
          analysisDueDate: item.analysis_due_date ? new Date(item.analysis_due_date) : null,
          analysisDate: item.analysis_date ? new Date(item.analysis_date) : null,
          infractionDescription: item.infraction_description ?? null,
          payerName: item.payer_name ?? null,
          payerTaxId: item.payer_tax_id ?? null,
          contestedAt: item.contested_at ? new Date(item.contested_at) : null,
          reviewerName: item.user?.name ?? null,
          chargeId,
          merchantId,
        };

        // Não sobrescrever analysisStatus se estiver AWAITING_APPROVAL
        if (!existing || existing.analysisStatus !== "AWAITING_APPROVAL") {
          data.analysisStatus = analysisStatusMap[item.analysis_status] ?? "PENDING";
        }

        // Refund
        if (item.refund) {
          if (item.refund.status) data.refundStatus = refundStatusMap[item.refund.status] ?? null;
          if (item.refund.analysis_status)
            data.refundAnalysisStatus = refundAnalysisMap[item.refund.analysis_status] ?? null;
          data.refundTransactionId = item.refund.transaction_id ?? null;
          data.refundedAmount = item.refund.refunded_amount ?? null;
          data.refundDate = item.refund.refund_date ? new Date(item.refund.refund_date) : null;
          data.refundRejectionReason = item.refund.rejection_reason ?? null;
        }

        if (existing) {
          await prisma.infraction.update({
            where: { acquirerInfractionId: item.id },
            data,
          });
          updated++;
        } else {
          await prisma.infraction.create({
            data: {
              acquirerInfractionId: item.id,
              acquirer: "transfeera",
              ...data,
            },
          });
          created++;
        }
      }

      request.log.info(
        `🔄  [SYNC] Infrações sincronizadas | total: ${result.items.length} | criadas: ${created} | atualizadas: ${updated}`,
      );

      return reply.send({
        message: "Sync concluído",
        created,
        updated,
        total: result.items.length,
      });
    },
  );
};
