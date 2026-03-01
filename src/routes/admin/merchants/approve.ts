import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { acquirerService } from "../../../services/acquirer.service.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const approveMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/approve
  app.post("/:id/approve", {
    schema: {
      tags: ["Admin"],
      summary: "Aprovar merchant",
      description: "Aprova o KYC e cria conta no adquirente. O merchant deve cadastrar a chave PIX depois.",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({
          message: z.string(),
          acquirerAccountId: z.string().nullish(),
          error: z.string().nullish(),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    if (merchant.kycStatus === "APPROVED") {
      return reply.status(400).send({ message: "Merchant já aprovado." });
    }

    await prisma.merchant.update({
      where: { id },
      data: { kycStatus: "APPROVED", kycAnalyzedAt: new Date() },
    });

    logAction({ action: "MERCHANT_APPROVED", actor: `admin:${request.user.id}`, target: id, ...getRequestContext(request) });

    try {
      const result = await acquirerService.setupMerchantAccount(id);
      return reply.status(200).send({
        message: "Merchant aprovado e conta no adquirente criada. O merchant deve cadastrar sua chave PIX.",
        acquirerAccountId: result.accountId,
      });
    } catch (error: any) {
      request.log.error({ error: error.message, merchantId: id }, "Erro ao criar conta no adquirente");
      return reply.status(200).send({
        message: "Merchant aprovado, mas houve erro ao criar conta no adquirente. Use /setup-acquirer.",
        error: error.message,
      });
    }
  });
};
