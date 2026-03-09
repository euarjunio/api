import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";

export const updatePartnerRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch("/me/partner", {
    schema: {
      tags: ["Merchants"],
      summary: "Atualizar dados do sócio (CNPJ)",
      description: "Salva nome e CPF do sócio administrador para merchants do tipo CNPJ",
      body: z.object({
        partnerName: z.string().min(3, "Nome do sócio deve ter pelo menos 3 caracteres"),
        partnerDocument: z
          .string()
          .min(11, "CPF inválido")
          .max(14, "CPF inválido")
          .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "CPF inválido"),
      }),
      response: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { partnerName, partnerDocument } = request.body;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true, documentType: true, kycStatus: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    if (merchant.documentType !== "CNPJ") {
      return reply.status(400).send({ message: "Dados do sócio são apenas para CNPJ." });
    }

    if (merchant.kycStatus === "APPROVED") {
      return reply.status(400).send({ message: "Compliance já aprovado." });
    }

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { partnerName, partnerDocument },
    });

    request.log.info({ merchantId: merchant.id }, "Partner data updated");

    return reply.status(200).send({ message: "Dados do sócio atualizados." });
  });
};
