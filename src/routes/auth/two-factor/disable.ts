import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { authenticate } from "../../hooks/authenticate.ts";
import { decryptSecret, verifyToken } from "../../../lib/totp.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const disable2faRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/2fa/disable",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Auth / 2FA"],
        summary: "Desativar 2FA",
        description: "Desativa o 2FA usando um código TOTP válido.",
        body: z.object({
          code: z.string().length(6),
        }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
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

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return reply.status(400).send({ message: "2FA não está ativo." });
      }

      const secret = decryptSecret(user.twoFactorSecret);
      const valid = verifyToken(secret, code);

      if (!valid) {
        return reply.status(400).send({ message: "Código inválido." });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: [],
        },
      });

      logAction({ action: "2FA_DISABLED", actor: userId, ...getRequestContext(request) });

      return reply.status(200).send({ message: "2FA desativado com sucesso." });
    },
  );
};
