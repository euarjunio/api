import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { getDocumentType, normalizeDocument } from "../../utils/br-document.ts";

export const createMerchantRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/", {
    schema: {
      tags: ["Merchants"],
      summary: "Criar logista",
      description: "Cria um novo logista para o usuário autenticado",
      body: z.object({
        name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        email: z.email("Email inválido"),
        phone: z.string().min(10).max(15),
        document: z.string().min(11).max(18),
        documentType: z.enum(["CPF", "CNPJ"]),
      }),
      response: {
        201: z.object({
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            document: z.string(),
            kycStatus: z.string(),
          }),
        }),
        409: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { name, email, phone, document, documentType } = request.body;
    const { id } = await checkUserRequest(request);

    const normalizedDocument = normalizeDocument(document);
    const inferredType = getDocumentType(normalizedDocument);
    if (!inferredType || inferredType !== documentType) {
      return reply.status(409).send({
        message: "Documento inválido para o tipo informado (CPF/CNPJ)",
      });
    }

    request.log.info({ userId: id, document: normalizedDocument }, "Creating merchant");

    const existingUserMerchant = await prisma.merchant.findUnique({
      where: { userId: id },
    });

    if (existingUserMerchant) {
      request.log.warn({ userId: id }, "Merchant creation failed: user already has merchant");
      return reply.status(409).send({
        message: "Você já possui um logista cadastrado",
      });
    }

    const existingMerchantByDocument = await prisma.merchant.findUnique({
      where: { document: normalizedDocument },
    });

    if (existingMerchantByDocument) {
      request.log.warn({ document }, "Merchant creation failed: document already exists");
      return reply.status(409).send({
        message: "Documento já cadastrado",
      });
    }

    const merchant = await prisma.merchant.create({
      data: {
        name,
        email,
        phone,
        document: normalizedDocument,
        documentType,
        userId: id,
      },
    });

    request.log.info({ merchantId: merchant.id, userId: id }, "Merchant created successfully");

    return reply.status(201).send({
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        document: merchant.document,
        kycStatus: merchant.kycStatus,
      },
    });
  });
};
