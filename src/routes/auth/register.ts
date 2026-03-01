import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hash } from "argon2";

import { prisma } from "../../lib/prisma.ts";
import { createVerificationCode } from "../../lib/verification-code.ts";
import { queueEmail } from "../../lib/queues/email-queue.ts";
import { verificationCodeEmail } from "../../lib/email-templates.ts";

export const registerRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/register",
    {
      schema: {
        tags: ["Auth"],
        summary: "Registrar novo usuário",
        description: "Cria uma nova conta de usuário no sistema e envia código de verificação",
        body: z.object({
          email: z.email(),
          password: z.string().min(6),
        }),
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      request.log.info({ email }, 'Registration attempt');

      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        request.log.warn({ email }, 'Registration failed: email already exists');
        return reply.status(400).send({ message: "email já cadastrado" });
      }

      const passwordHash = await hash(password);

      const user = await prisma.user.create({
        data: { email, passwordHash: passwordHash, role: "USER", emailVerified: false },
      });

      // Gerar e enviar código de verificação
      const code = await createVerificationCode(user.id, "EMAIL_VERIFICATION");
      const template = verificationCodeEmail(code);

      await queueEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
      });

      request.log.info({ userId: user.id, email }, 'User registered successfully, verification code sent');

      return reply
        .status(201)
        .send({ message: "usuário registrado com sucesso. Verifique seu email para confirmar a conta." });
    },
  );
};
