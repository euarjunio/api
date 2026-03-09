import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { verifyCode } from "../../lib/verification-code.ts";
import { queueEmail } from "../../lib/queues/email-queue.ts";
import { emailVerifiedConfirmation } from "../../lib/email-templates.ts";

export const verifyEmailRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/verify-email",
    {
      schema: {
        tags: ["Auth"],
        summary: "Verificar email com código",
        description: "Valida o código de verificação e marca o email como verificado",
        body: z.object({
          email: z.email(),
          code: z.string().length(6),
        }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, code } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(400).send({ message: "Código inválido ou expirado" });
      }

      if (user.emailVerified) {
        return reply.status(400).send({ message: "Email já verificado" });
      }

      const valid = await verifyCode(user.id, "EMAIL_VERIFICATION", code);

      if (!valid) {
        request.log.warn({ userId: user.id }, "Invalid verification code attempt");
        return reply.status(400).send({ message: "Código inválido ou expirado" });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });

      request.log.info({ userId: user.id }, "Email verified successfully");

      try {
        await queueEmail({ to: email, ...emailVerifiedConfirmation() });
      } catch (emailErr: any) {
        request.log.warn({ error: emailErr?.message, userId: user.id }, "Failed to queue email verified confirmation");
      }

      return reply.status(200).send({ message: "Email verificado com sucesso" });
    },
  );
};
