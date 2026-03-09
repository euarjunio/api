import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { authenticate } from "../../hooks/authenticate.ts";
import {
  generateSecret,
  generateQrCodeUri,
  encryptSecret,
} from "../../../lib/totp.ts";

export const setup2faRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/2fa/setup",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Auth / 2FA"],
        summary: "Gerar secret para configuração de 2FA",
        description:
          "Gera secret TOTP + URI otpauth:// para QR Code. Não ativa o 2FA, " +
          "é necessário chamar POST /2fa/enable com um código válido.",
        response: {
          200: z.object({
            secret: z.string(),
            qrCodeUri: z.string(),
          }),
          401: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, twoFactorEnabled: true },
      });

      if (!user) {
        return reply.status(401).send({ message: "Usuário não encontrado" });
      }

      if (user.twoFactorEnabled) {
        return reply.status(409).send({ message: "2FA já está ativo. Desative antes de reconfigurar." });
      }

      const secret = generateSecret();
      const qrCodeUri = generateQrCodeUri(user.email, secret);

      // Salva o secret encriptado temporariamente (ainda não ativado)
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: encryptSecret(secret) },
      });

      return reply.status(200).send({ secret, qrCodeUri });
    },
  );
};
