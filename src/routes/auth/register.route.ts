import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { hash } from "argon2";

import { prisma } from "../../lib/prisma.ts";

export const registerRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/register",
    {
      schema: {
        tags: ["Auth"],
        summary: "Registrar novo usuário",
        description: "Cria uma nova conta de usuário no sistema",
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
        data: { email, passwordHash: passwordHash, role: "USER" },
      });

      request.log.info({ userId: user.id, email }, 'User registered successfully');

      return reply
        .status(201)
        .send({ message: "usuário registrado com sucesso" });
    },
  );
};
