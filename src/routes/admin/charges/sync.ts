import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { getDefaultProvider } from "../../../providers/acquirer.registry.ts";
import { processWebhookEvent } from "../../webhooks/transfeera/handler.ts";

// Statuses da Transfeera que indicam cobrança paga
const PAID_STATUSES = ["PAGO", "CONCLUIDO", "LIQUIDADO", "PAID", "COMPLETED", "RECEIVED"];

export const syncChargesRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sync",
    {
      schema: {
        tags: ["Admin - Charges"],
        summary: "Sincronizar cobranças pagas perdidas",
        description:
          "Busca cobranças PENDING no banco dentro de um intervalo de datas, " +
          "consulta o status real na Transfeera e processa as que foram pagas " +
          "mas cujo webhook não chegou (ex: URL apontando para ngrok).",
        querystring: z.object({
          created_at__gte: z.string().describe("Data inicial (ISO 8601) ex: 2026-03-01T00:00:00Z"),
          created_at__lte: z.string().describe("Data final (ISO 8601) ex: 2026-03-11T23:59:59Z"),
          merchant_id: z.string().optional().describe("Filtrar por merchant específico"),
          dry_run: z.coerce.boolean().default(false).describe("Se true, apenas lista sem processar"),
        }),
        response: {
          200: z.object({
            message: z.string(),
            total: z.number(),
            processed: z.number(),
            skipped: z.number(),
            errors: z.array(z.object({
              txid: z.string(),
              chargeId: z.string(),
              error: z.string(),
            })),
            dry_run: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { created_at__gte, created_at__lte, merchant_id, dry_run } = request.query;

      // Buscar cobranças PENDING no período informado
      const pendingCharges = await prisma.charges.findMany({
        where: {
          status: "PENDING",
          createdAt: {
            gte: new Date(created_at__gte),
            lte: new Date(created_at__lte),
          },
          ...(merchant_id ? { merchantId: merchant_id } : {}),
          txid: { not: null },
        },
        include: {
          merchant: {
            select: { acquirerAccountId: true, name: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      request.log.info(
        `🔄  [SYNC-CHARGES] Encontradas ${pendingCharges.length} cobranças PENDING entre ${created_at__gte} e ${created_at__lte}${merchant_id ? ` para merchant ${merchant_id}` : ""}`,
      );

      const provider = getDefaultProvider();
      let processed = 0;
      let skipped = 0;
      const errors: { txid: string; chargeId: string; error: string }[] = [];

      for (const charge of pendingCharges) {
        if (!charge.txid || !charge.merchant?.acquirerAccountId) {
          skipped++;
          continue;
        }

        try {
          // Token com escopo do merchant para consultar a cobrança
          const token = await provider.getMerchantToken(charge.merchant.acquirerAccountId);

          if (!provider.getChargeByTxid) {
            request.log.warn(`[SYNC-CHARGES] Provider não implementa getChargeByTxid`);
            break;
          }

          const remoteCharge = await provider.getChargeByTxid(token, charge.txid);

          if (!remoteCharge) {
            request.log.info(`[SYNC-CHARGES] Cobrança não encontrada na Transfeera | txid: ${charge.txid}`);
            skipped++;
            continue;
          }

          const isPaid = PAID_STATUSES.some(s =>
            remoteCharge.status.toUpperCase().includes(s)
          );

          if (!isPaid) {
            request.log.info(
              `[SYNC-CHARGES] Cobrança ainda não paga | txid: ${charge.txid} | status: ${remoteCharge.status}`,
            );
            skipped++;
            continue;
          }

          if (dry_run) {
            request.log.info(
              `[SYNC-CHARGES] [DRY-RUN] Cobrança PAGA | txid: ${charge.txid} | status: ${remoteCharge.status} | merchant: ${charge.merchant.name}`,
            );
            processed++;
            continue;
          }

          // Processar como se fosse um webhook CashIn
          await processWebhookEvent(
            {
              object: "CashIn",
              id: `sync-${charge.txid}`,
              data: {
                txid: charge.txid,
                id: remoteCharge.id,
                value: (remoteCharge.value / 100).toFixed(2),
                payer: remoteCharge.payer ?? null,
              },
            },
            {
              info: (msg) => request.log.info(msg),
              warn: (msg) => request.log.warn(msg),
              error: (msg) => request.log.error(msg),
            },
          );

          request.log.info(
            `✅  [SYNC-CHARGES] Processada | txid: ${charge.txid} | merchant: ${charge.merchant.name}`,
          );
          processed++;
        } catch (err: any) {
          request.log.error(
            `❌  [SYNC-CHARGES] Erro ao processar | txid: ${charge.txid} | erro: ${err?.message}`,
          );
          errors.push({ txid: charge.txid, chargeId: charge.id, error: err?.message ?? String(err) });
        }
      }

      const summary = dry_run
        ? `[DRY-RUN] ${processed} seriam processadas, ${skipped} puladas, ${errors.length} erros`
        : `${processed} processadas, ${skipped} puladas, ${errors.length} erros`;

      request.log.info(`🔄  [SYNC-CHARGES] Concluído | ${summary}`);

      return reply.send({
        message: summary,
        total: pendingCharges.length,
        processed,
        skipped,
        errors,
        dry_run,
      });
    },
  );
};
