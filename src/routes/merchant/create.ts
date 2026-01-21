import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { check, z } from "zod/v4";
import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";

export const merchantCreate: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).post(
    "/merchants",
    {
      schema: {
        body: z.object({
          name: z.string(),
          email: z.email(),
          phone: z.string(),
          document: z.string(),
          documentType: z.enum(["CPF", "CNPJ"]),
        }),
      },
    },
    async (request, reply) => {
      const { name, email, phone, document, documentType } = request.body;

      const { id } = await checkUserRequest(request)

      // Verificar se o usuário já tem um merchant
      const existingUserMerchant = await prisma.merchant.findUnique({
        where: { userId: id },
      });

      if (existingUserMerchant) {
        return reply.status(409).send({
          message: "Você já possui um logista cadastrado"
        });
      }

      // Verificar se o documento já está cadastrado (por outro usuário)
      const existingMerchantByDocument = await prisma.merchant.findUnique({
        where: { document },
      });

      if (existingMerchantByDocument) {
        return reply.status(409).send({
          message: "Documento já cadastrado"
        });
      }

      const merchant = await prisma.merchant.create({
        data: {
          name,
          email,
          phone,
          document,
          documentType,
          userId: id,
        },
      });

      return reply.status(201).send({
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          document: merchant.document,
        },
      });
    },
  );
};
