import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";

export const kycStatusRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/documents/kyc-status
  app.get("/kyc-status", {
    schema: {
      tags: ["Merchants"],
      summary: "Consultar status KYC",
      description: "Retorna o status atual do compliance do merchant",
      response: {
        200: z.object({
          kycStatus: z.string(),
          kycNotes: z.string().nullable(),
          kycAnalyzedAt: z.date().nullable(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { kycStatus: true, kycNotes: true, kycAnalyzedAt: true },
    });

    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    return reply.status(200).send({
      kycStatus: merchant.kycStatus,
      kycNotes: merchant.kycNotes,
      kycAnalyzedAt: merchant.kycAnalyzedAt,
    });
  });
};
