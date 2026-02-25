import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { acquirerService } from "../../../services/acquirer.service.ts";

export const setupAcquirerRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/admin/merchants/:id/setup-acquirer
  app.post("/:id/setup-acquirer", {
    schema: {
      tags: ["Admin"],
      summary: "Retry setup adquirente",
      description: "Tenta novamente criar conta no adquirente (sem chave PIX)",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({
          message: z.string(),
          acquirerAccountId: z.string(),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
        500: z.object({ message: z.string(), error: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    if (merchant.kycStatus !== "APPROVED") {
      return reply.status(400).send({ message: "Merchant precisa ser aprovado antes." });
    }

    if (merchant.acquirerAccountId) {
      return reply.status(400).send({ message: "Merchant já possui conta no adquirente configurada." });
    }

    try {
      const result = await acquirerService.setupMerchantAccount(id);
      return reply.status(200).send({
        message: "Conta no adquirente criada com sucesso. O merchant deve cadastrar sua chave PIX.",
        acquirerAccountId: result.accountId,
      });
    } catch (error: any) {
      request.log.error({ error: error.message, merchantId: id }, "Erro no retry adquirente");
      return reply.status(500).send({
        message: "Falha ao criar conta no adquirente.",
        error: error.message,
      });
    }
  });
};
