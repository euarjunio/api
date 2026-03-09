import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hash, verify } from "argon2";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../hooks/authenticate.ts";
import { logAction, getRequestContext } from "../../lib/audit.ts";
import { invalidateUserTokens } from "../../lib/jwt-blacklist.ts";

export const changePasswordRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/change-password",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Auth"],
        summary: "Alterar senha",
        description: "Altera a senha do usuário autenticado usando a senha atual",
        body: z.object({
          currentPassword: z.string().min(6),
          newPassword: z.string().min(6),
        }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
      });

      if (!user) {
        return reply.status(400).send({ message: "Usuário não encontrado" });
      }

      const isCurrentPasswordValid = await verify(user.passwordHash, currentPassword);

      if (!isCurrentPasswordValid) {
        request.log.warn({ userId: user.id }, "Invalid current password attempt");
        return reply.status(400).send({ message: "Senha atual incorreta" });
      }

      const newPasswordHash = await hash(newPassword);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      // Invalidate all existing JWTs for this user
      await invalidateUserTokens(user.id);

      request.log.info({ userId: user.id }, "Password changed successfully");
      logAction({ action: "PASSWORD_CHANGED", actor: user.id, ...getRequestContext(request) });

      return reply.status(200).send({ message: "Senha alterada com sucesso" });
    },
  );
};
