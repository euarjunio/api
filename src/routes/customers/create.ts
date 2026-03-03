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
      description: "Cadastra um novo cliente manualmente. O documento (CPF ou CNPJ) deve ser único.",
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
        409: z.object({ message: z.string() }),
        422: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    // Apenas verifica que o usuário está autenticado (não precisa do merchant para criar cliente)
    await checkUserRequest(request);

    const { name, email, phone, document } = request.body;

    const normalizedDoc = normalizeDocument(document);
    const documentType = getDocumentType(normalizedDoc);

    if (!documentType) {
      return reply.status(422).send({
        message: "Documento não é um CPF nem CNPJ válido",
      });
    }

    // Verificar duplicidade por documento ou e-mail
    const existing = await prisma.customer.findFirst({
      where: {
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
