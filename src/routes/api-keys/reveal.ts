import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { decryptSecret, verifyToken } from "../../lib/totp.ts";
import { verifyCode } from "../../lib/verification-code.ts";
import { logAction, getRequestContext } from "../../lib/audit.ts";

export const revealApiKeyRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).post("/:id/reveal", {
    schema: {
      tags: ["API Keys"],
      summary: "Revelar API Key",
      description: "Descriptografa e retorna a chave completa após verificação 2FA ou código email.",
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        verificationCode: z.string().min(6).max(8),
        verificationMethod: z.enum(["email", "totp"]),
      }),
      response: {
        200: z.object({ value: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { id: apiKeyId } = request.params;
    const { verificationCode, verificationMethod } = request.body;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const apiKey = await prisma.apikey.findFirst({
      where: { id: apiKeyId, merchantId: merchant.id },
      select: { id: true, keyEncrypted: true },
    });

    if (!apiKey) {
      return reply.status(404).send({ message: "API Key não encontrada" });
    }

    if (!apiKey.keyEncrypted) {
      return reply.status(400).send({ message: "Chave não pode ser revelada (criada antes deste recurso)" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (verificationMethod === "totp") {
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        return reply.status(400).send({ message: "2FA não está ativado" });
      }
      const secret = decryptSecret(user.twoFactorSecret);
      if (!verifyToken(secret, verificationCode)) {
        return reply.status(400).send({ message: "Código 2FA inválido" });
      }
    } else {
      const valid = await verifyCode(userId, "SENSITIVE_ACTION", verificationCode);
      if (!valid) {
        return reply.status(400).send({ message: "Código de verificação inválido ou expirado" });
      }
    }

    const plainKey = decryptSecret(apiKey.keyEncrypted);

    logAction({
      action: "API_KEY_REVEALED",
      actor: userId,
      target: apiKeyId,
      metadata: { merchantId: merchant.id },
      ...getRequestContext(request),
    });

    return reply.status(200).send({ value: plainKey });
  });
};
