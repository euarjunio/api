import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.ts";
import { isTokenInvalidated } from "../../lib/jwt-blacklist.ts";

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
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

  if (request.user.role === "ADMIN") return;

  const merchant = await prisma.merchant.findUnique({
    where: { userId: request.user.id },
    select: { id: true, status: true },
  });

  if (merchant && merchant.status !== "ACTIVE") {
    return reply.status(403).send({ message: "Sua conta está bloqueada. Entre em contato com o suporte." });
  }

  if (merchant) {
    request.user.merchantId = merchant.id;
  }
}
