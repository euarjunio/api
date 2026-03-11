import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { ledgerService } from "../../../services/ledger.service.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";
import { invalidateMerchantCaches } from "../../../lib/cache.ts";

export const ledgerAdjustmentRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/ledger-adjustment
  app.post("/:id/ledger-adjustment", {
    schema: {
      tags: ["Admin"],
      summary: "Ajuste manual no ledger do merchant",
      description: "Cria uma entrada ADJUSTMENT no ledger. Use valores positivos para crédito e negativos para débito. Requer justificativa obrigatória para auditoria.",
      params: z.object({ id: z.uuid() }),
      body: z.object({
        amount: z.number().int().refine((v) => v !== 0, "O valor não pode ser zero"),
        reason: z.string().min(5, "Justificativa muito curta"),
        chargeId: z.string().uuid().optional(),
      }),
      response: {
        200: z.object({
          message: z.string(),
          entry: z.object({
            id: z.string(),
            amount: z.number(),
            type: z.string(),
            status: z.string(),
            createdAt: z.date(),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { amount, reason, chargeId } = request.body;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    const entry = await ledgerService.addTransaction({
      merchantId: id,
      amount,
      type: "ADJUSTMENT",
      status: "AVAILABLE",
      description: `Ajuste manual | motivo: ${reason}`,
      chargeId,
      metadata: {
        adminId: request.user.id,
        reason,
        adjustedAt: new Date().toISOString(),
      },
    });

    await invalidateMerchantCaches(id);

    logAction({
      action: "LEDGER_ADJUSTMENT",
      actor: `admin:${request.user.id}`,
      target: id,
      metadata: { amount, reason, chargeId: chargeId ?? null, entryId: entry.id },
      ...getRequestContext(request),
    });

    request.log.info(
      `🔧 [LEDGER_ADJUSTMENT] merchantId: ${id} | amount: ${amount} | reason: ${reason} | entryId: ${entry.id}`
    );

    return reply.status(200).send({
      message: "Ajuste aplicado com sucesso",
      entry: {
        id: entry.id,
        amount: entry.amount,
        type: entry.type,
        status: entry.status,
        createdAt: entry.createdAt,
      },
    });
  });
};
