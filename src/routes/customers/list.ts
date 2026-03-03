import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { authenticate } from "../hooks/authenticate.ts";

export const listCustomersRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate).get("/", {
    schema: {
      tags: ["Customers"],
      summary: "Listar clientes",
      description: "Lista os clientes que realizaram ao menos uma cobrança do merchant autenticado.",
      querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        search: z.string().max(255).optional(),
      }),
      response: {
        200: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          customers: z.array(z.object({
            id: z.string(),
            name: z.string(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
            document: z.string(),
            documentType: z.string(),
            totalCharges: z.number(),
            createdAt: z.string().datetime(),
          })),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { page, limit, search } = request.query;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    // Busca IDs de clientes com cobranças deste merchant
    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { document: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const customerWhere = {
      charges: {
        some: { merchantId: merchant.id },
      },
      ...searchFilter,
    };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where: customerWhere }),
      prisma.customer.findMany({
        where: customerWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          document: true,
          documentType: true,
          createdAt: true,
          _count: {
            select: {
              charges: {
                where: { merchantId: merchant.id },
              },
            },
          },
        },
      }),
    ]);

    return reply.status(200).send({
      page,
      limit,
      total,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        document: c.document,
        documentType: c.documentType,
        totalCharges: c._count.charges,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  });
};
