import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { verify } from "argon2";
import jwt from "jsonwebtoken";

import { prisma } from "../../lib/prisma.ts";
import { env } from "../../config/env.ts";

export const loginAuth: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Autenticar usuário",
        description: "Realiza login e retorna token JWT",
        body: z.object({
          email: z.email(),
          password: z.string().min(6),
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: z.object({
              id: z.string(),
              email: z.string(),
              role: z.string(),
            }),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      request.log.info({ email }, 'Login attempt');

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        request.log.warn({ email }, 'Login failed: user not found');
        return reply.status(401).send({ message: "email ou senha invalidos" });
      }

      const passwordHash = await verify(user.passwordHash, password);

      if (!passwordHash) {
        request.log.warn({ email, userId: user.id }, 'Login failed: invalid password');
        return reply.status(401).send({ message: "email ou senha invalidos" });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET);

      request.log.info({ userId: user.id, email }, 'Login successful');

      return reply.status(200).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    },
  );
};
