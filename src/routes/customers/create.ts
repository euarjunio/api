import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { authenticate } from "../hooks/authenticate.ts";
import { getDocumentType, normalizeDocument } from "../../utils/br-document.ts";

export const createCustomerRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate).post("/", {
    schema: {
      tags: ["Customers"],
      summary: "Cadastrar cliente",
      description: "Cadastra um novo cliente para o merchant autenticado. O documento (CPF ou CNPJ) deve ser único por merchant.",
      body: z.object({
        name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(255),
        email: z.email("E-mail inválido").optional(),
        phone: z.string().min(10).max(15).optional(),
        document: z.string().min(11).max(18, "Documento inválido"),
      }),
      response: {
        201: z.object({
          customer: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
            document: z.string(),
            documentType: z.string(),
            createdAt: z.string().datetime(),
          }),
        }),
        404: z.object({ message: z.string() }),
        409: z.object({ message: z.string() }),
        422: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const { name, email, phone, document } = request.body;

    const normalizedDoc = normalizeDocument(document);
    const documentType = getDocumentType(normalizedDoc);

    if (!documentType) {
      return reply.status(422).send({
        message: "Documento não é um CPF nem CNPJ válido",
      });
    }

    // Scoped duplicate check: unique per merchant
    const existing = await prisma.customer.findFirst({
      where: {
        merchantId: merchant.id,
        OR: [
          { document: normalizedDoc },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (existing) {
      const reason = existing.document === normalizedDoc ? "documento" : "e-mail";
      return reply.status(409).send({
        message: `Já existe um cliente cadastrado com este ${reason}`,
      });
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        email: email ?? null,
        phone: phone ?? null,
        document: normalizedDoc,
        documentType,
        merchantId: merchant.id,
      },
    });

    return reply.status(201).send({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        document: customer.document,
        documentType: customer.documentType,
        createdAt: customer.createdAt.toISOString(),
      },
    });
  });
};
