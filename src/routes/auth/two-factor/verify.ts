import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../../../lib/prisma.ts";
import { env } from "../../../config/env.ts";
import { redis } from "../../../lib/redis.ts";
import { decryptSecret, verifyToken, verifyBackupCode } from "../../../lib/totp.ts";
import { logAction, getRequestContext } from "../../../lib/audit.ts";

const MAX_2FA_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS = 15 * 60; // 15 minutos

function attemptsKey(userId: string) {
  return `2fa_attempts:${userId}`;
}

export const verify2faRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/2fa/verify",
    {
      schema: {
        tags: ["Auth / 2FA"],
        summary: "Verificar código 2FA (step-2 do login)",
        description:
          "Recebe o tempToken (JWT com scope 2fa, TTL 5min) e um código TOTP ou backup code. " +
          "Retorna o JWT definitivo. Máximo de 5 tentativas antes de bloquear por 15 min.",
        body: z.object({
          tempToken: z.string(),
          code: z.string().min(6).max(9), // 6 dígitos ou XXXX-XXXX backup
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
            remainingAttempts: z.number().optional(),
            locked: z.boolean().optional(),
          }),
          429: z.object({
            message: z.string(),
            locked: z.literal(true),
            retryAfterSeconds: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { tempToken, code } = request.body;

      // Verificar tempToken
      let payload: { id: string; scope: string };
      try {
        payload = jwt.verify(tempToken, env.JWT_SECRET) as any;
        if (payload.scope !== "2fa") throw new Error("Invalid scope");
      } catch {
        return reply.status(401).send({ message: "Token temporário inválido ou expirado." });
      }

      // Verificar se está bloqueado por excesso de tentativas
      const key = attemptsKey(payload.id);
      const currentAttempts = parseInt(await redis.get(key) ?? "0", 10);

      if (currentAttempts >= MAX_2FA_ATTEMPTS) {
        const ttl = await redis.ttl(key);
        logAction({ action: "LOGIN_FAILED", actor: payload.id, metadata: { reason: "2fa_locked_out" }, ...getRequestContext(request) });
        return reply.status(429).send({
          message: `Muitas tentativas incorretas. Tente novamente em ${Math.ceil(ttl / 60)} minuto(s).`,
          locked: true as const,
          retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_TTL_SECONDS,
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          role: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
        },
      });

      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return reply.status(401).send({ message: "2FA não está configurado." });
      }

      const secret = decryptSecret(user.twoFactorSecret);

      // Tentar verificação TOTP normal
      if (verifyToken(secret, code)) {
        // Sucesso → limpar tentativas
        await redis.del(key);

        const finalToken = jwt.sign(
          { id: user.id, role: user.role },
          env.JWT_SECRET,
          { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] },
        );

        logAction({ action: "LOGIN", actor: user.id, metadata: { method: "2fa_totp" }, ...getRequestContext(request) });

        return reply.status(200).send({
          token: finalToken,
          user: { id: user.id, email: user.email, role: user.role },
        });
      }

      // Tentar como backup code (formato XXXX-XXXX)
      const backupIdx = await verifyBackupCode(code, user.twoFactorBackupCodes);
      if (backupIdx >= 0) {
        // Sucesso → limpar tentativas e remover backup code usado
        await redis.del(key);

        const updatedCodes = [...user.twoFactorBackupCodes];
        updatedCodes.splice(backupIdx, 1);

        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: updatedCodes },
        });

        const finalToken = jwt.sign(
          { id: user.id, role: user.role },
          env.JWT_SECRET,
          { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] },
        );

        logAction({ action: "LOGIN", actor: user.id, metadata: { method: "2fa_backup" }, ...getRequestContext(request) });

        return reply.status(200).send({
          token: finalToken,
          user: { id: user.id, email: user.email, role: user.role },
        });
      }

      // Código inválido → incrementar tentativas
      const newCount = await redis.incr(key);
      if (newCount === 1) {
        // Primeira tentativa falha → setar TTL
        await redis.expire(key, LOCKOUT_TTL_SECONDS);
      }

      const remaining = MAX_2FA_ATTEMPTS - newCount;

      logAction({ action: "LOGIN_FAILED", actor: user.id, metadata: { reason: "invalid_2fa_code", attempts: newCount }, ...getRequestContext(request) });

      if (remaining <= 0) {
        const ttl = await redis.ttl(key);
        return reply.status(429).send({
          message: `Muitas tentativas incorretas. Tente novamente em ${Math.ceil(ttl / 60)} minuto(s).`,
          locked: true as const,
          retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_TTL_SECONDS,
        });
      }

      return reply.status(401).send({
        message: `Código inválido. ${remaining} tentativa${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`,
        remainingAttempts: remaining,
        locked: false,
      });
    },
  );
};
