import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";

export const merchantCreate: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).post(
    "/merchants",
    {
      schema: {
        tags: ["Merchants"],
        summary: "Criar merchant",
        description: "Cria um novo merchant para o usuário autenticado",
        body: z.object({
          name: z.string(),
          email: z.email(),
          phone: z.string(),
          document: z.string(),
          documentType: z.enum(["CPF", "CNPJ"]),
        }),
        response: {
          201: z.object({
            merchants: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
              document: z.string(),
            }),
          }),
          409: z.object({
            message: z.string(),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { name, email, phone, document, documentType } = request.body;

      const { id } = await checkUserRequest(request);

      const existingUserMerchant = await prisma.merchant.findUnique({
        where: { userId: id },
      });

      if (existingUserMerchant) {
        return reply.status(409).send({
          message: "Você já possui um logista cadastrado",
        });
      }

      const existingMerchantByDocument = await prisma.merchant.findUnique({
        where: { document },
      });

      if (existingMerchantByDocument) {
        return reply.status(409).send({
          message: "Documento já cadastrado",
        });
      }

      const merchants = await prisma.merchant.create({
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
        merchants: {
          id: merchants.id,
          name: merchants.name,
          email: merchants.email,
          document: merchants.document,
        },
      });
    },
  );
};
