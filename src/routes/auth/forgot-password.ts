import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { createVerificationCode, checkCooldown } from "../../lib/verification-code.ts";
import { queueEmail } from "../../lib/queues/email-queue.ts";
import { passwordResetEmail } from "../../lib/email-templates.ts";

export const forgotPasswordRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/forgot-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Solicitar recuperação de senha",
        description: "Envia código de 6 dígitos para o email para redefinir a senha",
        body: z.object({
          email: z.email(),
        }),
        response: {
          200: z.object({ message: z.string() }),
          429: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;

      // Sempre retorna 200 (não revela se o email existe)
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(200).send({
          message: "Se o email estiver cadastrado, você receberá um código",
        });
      }

      // Cooldown anti-spam
      const canSend = await checkCooldown(user.id, "PASSWORD_RESET");
      if (!canSend) {
        return reply.status(429).send({
          message: "Aguarde antes de solicitar outro código",
        });
      }

      const code = await createVerificationCode(user.id, "PASSWORD_RESET");
      const template = passwordResetEmail(code);

      await queueEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
      });

      request.log.info({ userId: user.id }, "Password reset code sent");

      return reply.status(200).send({
        message: "Se o email estiver cadastrado, você receberá um código",
      });
    },
  );
};
