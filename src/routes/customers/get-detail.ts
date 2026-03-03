import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { authenticate } from "../hooks/authenticate.ts";

export const getCustomerDetailRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate).get("/:id", {
    schema: {
      tags: ["Customers"],
      summary: "Detalhe do cliente",
      description: "Retorna dados do cliente e o histórico de cobranças dele associadas ao merchant autenticado.",
      params: z.object({
        id: z.uuid(),
      }),
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      }),
      response: {
        200: z.object({
          customer: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
            document: z.string(),
            documentType: z.string(),
            createdAt: z.string().datetime(),
          }),
          charges: z.object({
            page: z.number(),
            limit: z.number(),
            total: z.number(),
            items: z.array(z.object({
              id: z.string(),
              amount: z.number(),
              description: z.string(),
              status: z.string(),
              txid: z.string().nullable(),
              paidAt: z.string().datetime().nullable(),
              createdAt: z.string().datetime(),
            })),
          }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { id: customerId } = request.params;
    const { page, limit } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return reply.status(404).send({ message: "Cliente não encontrado" });
    }

    // Confirmar que o cliente tem ao menos uma cobrança deste merchant
    const chargesWhere = {
      customerId,
      merchantId: merchant.id,
    };

    const [total, charges] = await Promise.all([
      prisma.charges.count({ where: chargesWhere }),
      prisma.charges.findMany({
        where: chargesWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          description: true,
          status: true,
          txid: true,
          paidAt: true,
          createdAt: true,
        },
      }),
    ]);

    if (total === 0) {
      return reply.status(404).send({ message: "Cliente não encontrado" });
    }

    return reply.status(200).send({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        document: customer.document,
        documentType: customer.documentType,
        createdAt: customer.createdAt.toISOString(),
      },
      charges: {
        page,
        limit,
        total,
        items: charges.map((c) => ({
          id: c.id,
          amount: c.amount,
          description: c.description,
          status: c.status,
          txid: c.txid,
          paidAt: c.paidAt ? c.paidAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    });
  });
};
