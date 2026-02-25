import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { getDefaultProvider } from "../../../providers/acquirer.registry.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";

export const approveInfractionRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/:id/approve",
    {
      schema: {
        tags: ["Admin - Infractions"],
        summary: "Aprovar e enviar análise ao adquirente",
        description:
          "O admin revisa a análise do merchant, pode modificar a decisão/justificativa, " +
          "e envia a análise final para o adquirente via API. " +
          "Se não informar analysis/description, usa os valores que o merchant submeteu.",
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          analysis: z.enum(["accepted", "rejected"]).optional(),
          description: z.string().min(5).optional(),
          adminNotes: z.string().optional(),
        }),
        response: {
          200: z.object({
            message: z.string(),
            infraction: z.object({
              id: z.string(),
              analysisStatus: z.string(),
              sentAnalysis: z.string(),
              sentDescription: z.string(),
              sentAt: z.string(),
            }),
            acquirerResponse: z.any(),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const adminUser = await checkUserRequest(request);
      const { id } = request.params;
      const { analysis, description, adminNotes } = request.body;

      const infraction = await prisma.infraction.findUnique({
        where: { id },
        include: { merchant: true },
      });

      if (!infraction) {
        return reply.status(404).send({ message: "Infração não encontrada" });
      }

      // Verificar se já foi enviada
      if (infraction.sentAt) {
        return reply.status(400).send({
          message: "Esta infração já foi enviada ao adquirente",
        });
      }

      if (infraction.status === "CANCELED") {
        return reply.status(400).send({
          message: "Esta infração foi cancelada e não pode ser analisada",
        });
      }

      // Determinar análise final (admin pode sobrescrever ou usar a do merchant)
      const finalAnalysis = analysis ?? infraction.merchantAnalysis;
      const finalDescription = description ?? infraction.merchantDescription;

      if (!finalAnalysis || !finalDescription) {
        return reply.status(400).send({
          message:
            "Análise e justificativa são obrigatórias. " +
            "O merchant ainda não enviou sua análise ou os campos estão vazios. " +
            "Informe 'analysis' e 'description' no body.",
        });
      }

      // Enviar para o adquirente
      const provider = getDefaultProvider();
      const token = await provider.getAdminToken();
      const acquirerResponse = await provider.analyzeInfraction(
        token,
        infraction.acquirerInfractionId,
        {
          analysis: finalAnalysis as "accepted" | "rejected",
          analysis_description: finalDescription,
        },
      );

      // Atualizar no banco
      const now = new Date();
      const updated = await prisma.infraction.update({
        where: { id: infraction.id },
        data: {
          analysisStatus: finalAnalysis === "accepted" ? "ACCEPTED" : "REJECTED",
          sentAnalysis: finalAnalysis,
          sentDescription: finalDescription,
          sentAt: now,
          adminApprovedBy: adminUser.id,
          adminNotes: adminNotes ?? null,
          adminApprovedAt: now,
        },
      });

      request.log.info(
        `✅  [INFRACTION] Admin aprovou e enviou | infractionId: ${id} | analysis: ${finalAnalysis} | admin: ${adminUser.id}`,
      );

      return reply.send({
        message: "Análise enviada ao adquirente com sucesso",
        infraction: {
          id: updated.id,
          analysisStatus: updated.analysisStatus,
          sentAnalysis: updated.sentAnalysis!,
          sentDescription: updated.sentDescription!,
          sentAt: updated.sentAt!.toISOString(),
        },
        acquirerResponse,
      });
    },
  );
};
