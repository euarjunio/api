import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { prisma } from "../../../lib/prisma.ts";
import { decryptSecret, verifyToken } from "../../../lib/totp.ts";
import { verifyCode } from "../../../lib/verification-code.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const revealWebhookSecretRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/:id/reveal", {
    schema: {
      tags: ["Webhooks"],
      summary: "Revelar webhook secret",
      description: "Retorna o secret completo do webhook após verificação 2FA ou código email.",
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        verificationCode: z.string().min(6).max(8),
        verificationMethod: z.enum(["email", "totp"]),
      }),
      response: {
        200: z.object({ secret: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { id: webhookId } = request.params;
    const { verificationCode, verificationMethod } = request.body;

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    const webhook = await prisma.merchantWebhook.findFirst({
      where: { id: webhookId, merchantId: merchant.id },
      select: { id: true, secret: true },
    });

    if (!webhook) {
      return reply.status(404).send({ message: "Webhook não encontrado" });
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

    logAction({
      action: "WEBHOOK_SECRET_REVEALED",
      actor: userId,
      target: webhookId,
      metadata: { merchantId: merchant.id },
      ...getRequestContext(request),
    });

    return reply.status(200).send({ secret: webhook.secret });
  });
};
