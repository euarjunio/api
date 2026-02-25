import { FastifyReply, FastifyRequest } from "fastify";

export async function verifyAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();

    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({ message: "Acesso restrito a administradores" });
    }
  } catch {
    return reply.status(401).send({ message: "Token inválido ou expirado" });
  }
}