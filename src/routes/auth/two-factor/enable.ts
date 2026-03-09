import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { authenticate } from "../../hooks/authenticate.ts";
import {
  decryptSecret,
  verifyToken,
  generateBackupCodes,
  hashBackupCodes,
} from "../../../lib/totp.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";
import { invalidateUserTokens } from "../../../lib/jwt-blacklist.ts";

export const enable2faRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/2fa/enable",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Auth / 2FA"],
        summary: "Ativar 2FA",
        description:
          "Valida o código TOTP gerado pelo app authenticator e ativa o 2FA. " +
          "Retorna 8 backup codes (guarde-os em lugar seguro).",
        body: z.object({
          code: z.string().length(6),
        }),
        response: {
          200: z.object({
            message: z.string(),
            backupCodes: z.array(z.string()),
          }),
          400: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { code } = request.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
      });

      if (!user) {
        return reply.status(401).send({ message: "Usuário não encontrado" });
      }

      if (user.twoFactorEnabled) {
        return reply.status(409).send({ message: "2FA já está ativo." });
      }

      if (!user.twoFactorSecret) {
        return reply.status(400).send({ message: "Execute GET /2fa/setup antes de ativar." });
      }

      const secret = decryptSecret(user.twoFactorSecret);
      const valid = verifyToken(secret, code);

      if (!valid) {
        return reply.status(400).send({ message: "Código inválido. Tente novamente." });
      }

      // Gerar backup codes
      const plainCodes = generateBackupCodes(8);
      const hashedCodes = await hashBackupCodes(plainCodes);

      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorBackupCodes: hashedCodes,
        },
      });

      // Invalidate existing JWTs after 2FA state change
      await invalidateUserTokens(userId);

      logAction({ action: "2FA_ENABLED", actor: userId, ...getRequestContext(request) });

      return reply.status(200).send({
        message: "2FA ativado com sucesso.",
        backupCodes: plainCodes,
      });
    },
  );
};
