import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";

export const listMerchantInfractionsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["Infractions"],
        summary: "Listar infrações do merchant",
        description: "Lista infrações PIX (MED) associadas ao merchant autenticado.",
        querystring: z.object({
          status: z.enum(["PENDING", "AGREED", "DISAGREED", "CANCELED"]).optional(),
          analysisStatus: z
            .enum(["PENDING", "AWAITING_APPROVAL", "ACCEPTED", "REJECTED", "DELAYED", "CANCELED"])
            .optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
        response: {
          200: z.object({
            infractions: z.array(
              z.object({
                id: z.string(),
                acquirerInfractionId: z.string(),
                status: z.string(),
                analysisStatus: z.string(),
                situationType: z.string(),
                amount: z.number(),
                txid: z.string().nullable(),
                transactionId: z.string().nullable(),
                payerName: z.string().nullable(),
                payerTaxId: z.string().nullable(),
                infractionDate: z.string(),
                analysisDueDate: z.string().nullable(),
                createdAt: z.string(),
              }),
            ),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const user = await checkUserRequest(request);
      const { status, analysisStatus, page, limit } = request.query;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: user.id },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      const where: any = { merchantId: merchant.id };
      if (status) where.status = status;
      if (analysisStatus) where.analysisStatus = analysisStatus;

      const [infractions, total] = await Promise.all([
        prisma.infraction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            acquirerInfractionId: true,
            status: true,
            analysisStatus: true,
            situationType: true,
            amount: true,
            txid: true,
            transactionId: true,
            payerName: true,
            payerTaxId: true,
            infractionDate: true,
            analysisDueDate: true,
            createdAt: true,
          },
        }),
        prisma.infraction.count({ where }),
      ]);

      return reply.send({
        infractions: infractions.map((i) => ({
          ...i,
          infractionDate: i.infractionDate.toISOString(),
          analysisDueDate: i.analysisDueDate?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
      });
    },
  );
};
