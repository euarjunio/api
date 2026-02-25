import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { getProviderForMerchant } from "../../../providers/acquirer.registry.ts";
import { normalizePixKeyStatus, isPixKeyActive } from "../../../providers/transfeera/transfeera.maps.ts";

export const createPixKeyRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/merchants/me/pix-keys
  app.post("/", {
    schema: {
      tags: ["Pix Keys"],
      summary: "Criar chave PIX aleatória",
      description: "Cria uma chave PIX aleatória (CHAVE_ALEATORIA) na conta do adquirente do merchant. Requer KYC aprovado e conta ativa.",
      response: {
        201: z.object({
          message: z.string(),
          pixKey: z.object({
            id: z.string(),
            key: z.string().nullable(),
            type: z.string(),
            status: z.string(),
          }),
        }),
        400: z.object({ message: z.string() }),
        403: z.object({ message: z.string() }),
        409: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
        500: z.object({ message: z.string(), error: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({ where: { userId } });
    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    if (merchant.kycStatus !== "APPROVED") {
      return reply.status(403).send({
        message: "Sua conta precisa ser aprovada pelo compliance antes de cadastrar chave PIX.",
      });
    }

    if (!merchant.acquirerAccountId) {
      return reply.status(403).send({
        message: "Conta do adquirente não configurada. Aguarde a ativação pelo administrador.",
      });
    }

    if (merchant.pixKeyId) {
      return reply.status(409).send({
        message: isPixKeyActive(merchant.pixKeyStatus)
          ? "Sua chave PIX já está ativa."
          : "Você já solicitou uma chave PIX. Aguarde a ativação.",
      });
    }

    try {
      const provider = await getProviderForMerchant(merchant.id);
      const merchantToken = await provider.getMerchantToken(merchant.acquirerAccountId);
      const pixKeyData = await provider.createRandomPixKey(merchantToken);

      const normalizedStatus = normalizePixKeyStatus(pixKeyData.status);

      await prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          pixKeyId: pixKeyData.id,
          pixKey: pixKeyData.key ?? null,
          pixKeyType: pixKeyData.type || "CHAVE_ALEATORIA",
          pixKeyStatus: normalizedStatus,
        },
      });

      request.log.info(
        { merchantId: merchant.id, pixKeyId: pixKeyData.id, type: "CHAVE_ALEATORIA" },
        "Chave PIX aleatória criada",
      );

      return reply.status(201).send({
        message: "Chave PIX aleatória criada com sucesso.",
        pixKey: {
          id: pixKeyData.id,
          key: pixKeyData.key ?? null,
          type: pixKeyData.type || "CHAVE_ALEATORIA",
          status: normalizedStatus,
        },
      });
    } catch (error: any) {
      request.log.error({ error: error.message, merchantId: merchant.id }, "Erro ao criar chave PIX");
      return reply.status(500).send({
        message: "Falha ao criar chave PIX.",
        error: error.message,
      });
    }
  });
};
