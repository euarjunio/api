import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";

export const analyzeMerchantInfractionRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/:id/analyze",
    {
      schema: {
        tags: ["Infractions"],
        summary: "Enviar análise de infração",
        description:
          "O merchant envia sua análise (aceitar/rejeitar) da infração. " +
          "A análise fica como AWAITING_APPROVAL até o admin aprovar e encaminhar ao adquirente.",
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          analysis: z.enum(["accepted", "rejected"]),
          description: z.string().min(5, "Justificativa deve ter pelo menos 5 caracteres"),
        }),
        response: {
          200: z.object({
            message: z.string(),
            infraction: z.object({
              id: z.string(),
              analysisStatus: z.string(),
              merchantAnalysis: z.string(),
              merchantDescription: z.string(),
              merchantAnalyzedAt: z.string(),
            }),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const user = await checkUserRequest(request);
      const { id } = request.params;
      const { analysis, description } = request.body;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: user.id },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      const infraction = await prisma.infraction.findFirst({
        where: { id, merchantId: merchant.id },
      });

      if (!infraction) {
        return reply.status(404).send({ message: "Infração não encontrada" });
      }

      // Verificar se a infração pode ser analisada
      if (infraction.sentAt) {
        return reply.status(400).send({
          message: "Esta infração já foi enviada ao adquirente e não pode ser alterada",
        });
      }

      if (infraction.status === "CANCELED") {
        return reply.status(400).send({
          message: "Esta infração foi cancelada e não pode ser analisada",
        });
      }

      // Salvar análise do merchant (NÃO envia ao adquirente ainda — aguarda admin)
      const now = new Date();
      const updated = await prisma.infraction.update({
        where: { id: infraction.id },
        data: {
          merchantAnalysis: analysis,
          merchantDescription: description,
          merchantAnalyzedAt: now,
          analysisStatus: "AWAITING_APPROVAL",
        },
      });

      request.log.info(
        `⚠️  [INFRACTION] Merchant analisou | infractionId: ${id} | analysis: ${analysis} | merchant: ${merchant.id}`,
      );

      return reply.send({
        message:
          "Análise registrada com sucesso. Aguardando aprovação do administrador antes do envio ao adquirente.",
        infraction: {
          id: updated.id,
          analysisStatus: updated.analysisStatus,
          merchantAnalysis: updated.merchantAnalysis!,
          merchantDescription: updated.merchantDescription!,
          merchantAnalyzedAt: updated.merchantAnalyzedAt!.toISOString(),
        },
      });
    },
  );
};
