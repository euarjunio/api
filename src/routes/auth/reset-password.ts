import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hash } from "argon2";
import { prisma } from "../../lib/prisma.ts";
import { verifyCode } from "../../lib/verification-code.ts";

export const resetPasswordRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/reset-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Redefinir senha com código",
        description: "Valida o código e define nova senha",
        body: z.object({
          email: z.email(),
          code: z.string().length(6),
          newPassword: z.string().min(6),
        }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, code, newPassword } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(400).send({ message: "Código inválido ou expirado" });
      }

      const valid = await verifyCode(user.id, "PASSWORD_RESET", code);

      if (!valid) {
        request.log.warn({ userId: user.id }, "Invalid reset code attempt");
        return reply.status(400).send({ message: "Código inválido ou expirado" });
      }

      const passwordHash = await hash(newPassword);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      request.log.info({ userId: user.id }, "Password reset successfully");

      return reply.status(200).send({ message: "Senha redefinida com sucesso" });
    },
  );
};
