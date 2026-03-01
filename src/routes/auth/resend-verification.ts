import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { createVerificationCode, checkCooldown } from "../../lib/verification-code.ts";
import { queueEmail } from "../../lib/queues/email-queue.ts";
import { verificationCodeEmail } from "../../lib/email-templates.ts";

export const resendVerificationRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/resend-verification",
    {
      schema: {
        tags: ["Auth"],
        summary: "Reenviar código de verificação de email",
        description: "Envia um novo código de verificação para o email",
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

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || user.emailVerified) {
        // Sempre retorna 200 para não revelar se o email existe
        return reply.status(200).send({ message: "Código enviado, se aplicável" });
      }

      const canSend = await checkCooldown(user.id, "EMAIL_VERIFICATION");
      if (!canSend) {
        return reply.status(429).send({ message: "Aguarde antes de solicitar outro código" });
      }

      const code = await createVerificationCode(user.id, "EMAIL_VERIFICATION");
      const template = verificationCodeEmail(code);

      await queueEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
      });

      request.log.info({ userId: user.id }, "Verification code resent");

      return reply.status(200).send({ message: "Código enviado, se aplicável" });
    },
  );
};
