import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

export const adminDisable2faRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/:id/disable-2fa",
    {
      schema: {
        tags: ["Admin / Merchants"],
        summary: "Desativar 2FA de um merchant (admin)",
        description:
          "Permite que um admin desative o 2FA de um merchant que perdeu acesso ao authenticator.",
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id: merchantId } = request.params;

      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { userId: true },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado." });
      }

      const user = await prisma.user.findUnique({
        where: { id: merchant.userId },
        select: { twoFactorEnabled: true },
      });

      if (!user || !user.twoFactorEnabled) {
        return reply.status(400).send({ message: "2FA não está ativo para este merchant." });
      }

      await prisma.user.update({
        where: { id: merchant.userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: [],
        },
      });

      request.log.info({ merchantId, adminId: request.user.id }, "Admin desativou 2FA do merchant");
      logAction({ action: "2FA_ADMIN_RESET", actor: `admin:${request.user.id}`, target: merchantId, metadata: { userId: merchant.userId }, ...getRequestContext(request) });

      return reply.status(200).send({ message: "2FA desativado com sucesso." });
    },
  );
};
