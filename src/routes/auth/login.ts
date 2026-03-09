import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { verify } from "argon2";
import jwt, { type SignOptions } from "jsonwebtoken";

import { prisma } from "../../lib/prisma.ts";
import { env } from "../../config/env.ts";
import { logAction, getRequestContext } from "../../lib/audit.ts";

export const loginRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Autenticar usuário",
        description: "Realiza login e retorna token JWT. Se 2FA estiver ativo, retorna tempToken.",
        body: z.object({
          email: z.email(),
          password: z.string().min(6),
        }),
        response: {
          200: z.union([
            z.object({
              token: z.string(),
              user: z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
                role: z.string()
              }),
            }),
            z.object({
              requiresTwoFactor: z.literal(true),
              tempToken: z.string(),
            }),
          ]),
          401: z.object({
            message: z.string(),
          }),
          403: z.object({
            message: z.string(),
            code: z.string(),
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

      const passwordValid = await verify(user.passwordHash, password);

      if (!passwordValid) {
        request.log.warn({ email, userId: user.id }, 'Login failed: invalid password');
        logAction({ action: "LOGIN_FAILED", actor: user.id, metadata: { email, reason: "invalid_password" }, ...getRequestContext(request) });
        return reply.status(401).send({ message: "email ou senha invalidos" });
      }

      // Verificar se o email está verificado
      if (!user.emailVerified) {
        request.log.warn({ email, userId: user.id }, 'Login failed: email not verified');
        return reply.status(403).send({
          message: "Email não verificado. Verifique sua caixa de entrada.",
          code: "EMAIL_NOT_VERIFIED",
        });
      }

      // Se 2FA ativo → retorna tempToken em vez de JWT definitivo
      if (user.twoFactorEnabled) {
        const tempToken = jwt.sign(
          { id: user.id, scope: "2fa" },
          env.JWT_SECRET,
          { expiresIn: "5m" },
        );

        request.log.info({ userId: user.id, email }, 'Login requires 2FA');

        return reply.status(200).send({
          requiresTwoFactor: true as const,
          tempToken,
        });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role},
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] },
      );

      request.log.info({ userId: user.id, email }, 'Login successful');
      logAction({ action: "LOGIN", actor: user.id, metadata: { email }, ...getRequestContext(request) });
      const displayName = user.name ?? user.email.split("@")[0];

      return reply.status(200).send({
        token,
        user: {
          id: user.id,
          name: displayName,
          email: user.email,
          role: user.role,
        },
      });
    },
  );
};
