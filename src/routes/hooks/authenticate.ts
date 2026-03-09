import { createHash } from "node:crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.ts";
import { redis } from "../../lib/redis.ts";
import { isTokenInvalidated } from "../../lib/jwt-blacklist.ts";

import { API_KEY_CACHE_TTL } from "../../config/constants.ts";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Hook de autenticação híbrida: aceita JWT ou API Key no header Bearer.
 *
 * - Se o token começar com "lk_" → busca API Key por SHA-256 hash
 * - Caso contrário → valida como JWT normalmente
 *
 * Em ambos os casos, popula `request.user` com { id, role, merchantId? }
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ message: "Cabeçalho de autorização ausente" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return reply.status(401).send({ message: "Token de autenticação ausente" });
  }

  // ── API Key ────────────────────────────────────────────────────────
  if (token.startsWith("lk_")) {
    const keyHash = hashApiKey(token);
    const cacheKey = `auth:apikey:${keyHash}`;

    let cached: { userId: string; merchantId: string; merchantStatus: string; keyStatus: string } | null = null;
    try {
      const raw = await redis.get(cacheKey);
      if (raw) cached = JSON.parse(raw);
    } catch { /* redis down — fallback to DB */ }

    if (cached) {
      if (cached.keyStatus !== "ACTIVE") {
        return reply.status(401).send({ message: "Chave de API inativa" });
      }
      if (cached.merchantStatus !== "ACTIVE") {
        return reply.status(403).send({ message: "Sua conta está inativa. Entre em contato com o suporte." });
      }
      request.user = { id: cached.userId, role: "USER", merchantId: cached.merchantId };
      return;
    }

    const apiKey = await prisma.apikey.findUnique({
      where: { keyHash },
      include: {
        merchant: {
          select: { id: true, userId: true, status: true },
        },
      },
    });

    if (!apiKey) {
      return reply.status(401).send({ message: "Chave de API inválida" });
    }

    if (apiKey.status !== "ACTIVE") {
      return reply.status(401).send({ message: "Chave de API inativa" });
    }

    if (apiKey.merchant.status !== "ACTIVE") {
      return reply.status(403).send({ message: "Sua conta está inativa. Entre em contato com o suporte." });
    }

    try {
      await redis.set(cacheKey, JSON.stringify({
        userId: apiKey.merchant.userId,
        merchantId: apiKey.merchant.id,
        merchantStatus: apiKey.merchant.status,
        keyStatus: apiKey.status,
      }), "EX", API_KEY_CACHE_TTL);
    } catch { /* cache set failure is non-critical */ }

    request.user = {
      id: apiKey.merchant.userId,
      role: "USER",
      merchantId: apiKey.merchant.id,
    };

    return;
  }

  // ── JWT ─────────────────────────────────────────────────────────────
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: "Token inválido ou expirado" });
  }

  // Check JWT blacklist (password change / 2FA toggle)
  const payload = request.user as any;
  if (payload.iat && await isTokenInvalidated(payload.id, payload.iat)) {
    return reply.status(401).send({ message: "Token revogado. Faça login novamente." });
  }

  // Admins passam direto (não têm merchant)
  if (request.user.role === "ADMIN") return;

  // Verificar se o merchant do usuário está ativo (retry on transient DB error)
  let merchant;
  try {
    merchant = await prisma.merchant.findUnique({
      where: { userId: request.user.id },
      select: { id: true, status: true },
    });
  } catch {
    try {
      merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
        select: { id: true, status: true },
      });
    } catch {
      return reply.status(503).send({ message: "Serviço temporariamente indisponível. Tente novamente." });
    }
  }

  if (merchant && merchant.status !== "ACTIVE") {
    return reply.status(403).send({ message: "Sua conta está bloqueada. Entre em contato com o suporte." });
  }

  if (merchant) {
    request.user.merchantId = merchant.id;
  }
}
