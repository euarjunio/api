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
          name: z.string().min(2).max(120),
          email: z.email(),
          phone: z.string().min(10).max(20).optional(),
          password: z.string().min(8).regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
            "Senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número",
          ),
        }),
      },
    },
    async (request, reply) => {
      const { name, email, phone, password } = request.body;

      request.log.info({ email }, 'Registration attempt');

      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        request.log.warn({ email }, 'Registration failed: email already exists');
        return reply.status(400).send({ message: "Não foi possível criar a conta. Verifique os dados e tente novamente." });
      }

      const passwordHash = await hash(password);

      const user = await prisma.user.create({
        data: { name, email, phone, passwordHash, role: "USER", emailVerified: false },
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
