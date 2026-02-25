import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.ts";

/**
 * Hook de autenticação híbrida: aceita JWT ou API Key no header Bearer.
 *
 * - Se o token começar com "lk_" → busca API Key no banco
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
    const apiKey = await prisma.apikey.findUnique({
      where: { value: token },
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

    // Popula request.user com os dados do merchant (compatível com checkUserRequest)
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

  // Admins passam direto (não têm merchant)
  if (request.user.role === "ADMIN") return;

  // Verificar se o merchant do usuário está ativo
  const merchant = await prisma.merchant.findUnique({
    where: { userId: request.user.id },
    select: { id: true, status: true },
  });

  if (merchant && merchant.status !== "ACTIVE") {
    return reply.status(403).send({ message: "Sua conta está bloqueada. Entre em contato com o suporte." });
  }

  // Popula merchantId no JWT para uso nas rotas
  if (merchant) {
    request.user.merchantId = merchant.id;
  }
}
