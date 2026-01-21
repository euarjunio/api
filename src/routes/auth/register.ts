import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { hash } from "argon2";

import { prisma } from "../../lib/prisma.ts";

export const registerAuth: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/register",
    {
      schema: {
        body: z.object({
          email: z.email(),
          password: z.string().min(6),
        }),
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        return reply.status(400).send({ message: "email já cadastrado" });
      }

      const passwordHash = await hash(password);

      await prisma.user.create({
        data: { email, passwordHash: passwordHash, role: "USER" },
      });

      return reply
        .status(201)
        .send({ message: "usuário registrado com sucesso" });
    },
  );
};
