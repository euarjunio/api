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
        body: z.object({
          email: z.email(),
          password: z.string().min(6),
        }),
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(401).send({ message: "email ou senha invalidos" });
      }

      const passwordHash = await verify(user.passwordHash, password);

      if (!passwordHash) {
        return reply.status(401).send({ message: "email ou senha invalidos" });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET);

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
