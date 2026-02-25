import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { getProviderForMerchant } from "../../../providers/acquirer.registry.ts";
import { normalizePixKeyStatus } from "../../../providers/transfeera/transfeera.maps.ts";

export const getPixKeyRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/pix-keys
  app.get("/", {
    schema: {
      tags: ["Pix Keys"],
      summary: "Consultar chave PIX",
      description: "Retorna os dados da chave PIX do merchant. Consulta o status atualizado no adquirente.",
      response: {
        200: z.object({
          pixKey: z.object({
            id: z.string(),
            key: z.string().nullable(),
            type: z.string(),
            status: z.string(),
          }).nullable(),
        }),
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

    if (!merchant.pixKeyId) {
      return reply.status(200).send({ pixKey: null });
    }

    try {
      const provider = await getProviderForMerchant(merchant.id);
      const merchantToken = await provider.getMerchantToken(merchant.acquirerAccountId!);
      const pixKeyData = await provider.getPixKeyById(merchantToken, merchant.pixKeyId);

      const normalized = normalizePixKeyStatus(pixKeyData.status);

      if (
        normalized !== merchant.pixKeyStatus ||
        pixKeyData.key !== merchant.pixKey ||
        (pixKeyData.type ?? null) !== (merchant.pixKeyType ?? null)
      ) {
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: {
            pixKeyStatus: normalized,
            pixKey: pixKeyData.key ?? null,
            pixKeyType: pixKeyData.type ?? merchant.pixKeyType ?? "CHAVE_ALEATORIA",
          },
        });
      }

      return reply.status(200).send({
        pixKey: {
          id: pixKeyData.id,
          key: pixKeyData.key ?? null,
          type: pixKeyData.type ?? merchant.pixKeyType ?? "CHAVE_ALEATORIA",
          status: normalized,
        },
      });
    } catch (error: any) {
      request.log.warn({ error: error.message, merchantId: merchant.id }, "Erro ao consultar PIX no adquirente, usando dados locais");
      return reply.status(200).send({
        pixKey: {
          id: merchant.pixKeyId,
          key: merchant.pixKey ?? null,
          type: merchant.pixKeyType || "CHAVE_ALEATORIA",
          status: normalizePixKeyStatus(merchant.pixKeyStatus),
        },
      });
    }
  });
};
