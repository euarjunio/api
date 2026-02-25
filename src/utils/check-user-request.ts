import { FastifyRequest } from "fastify";
import { BadRequestError } from "../routes/errors/bad-request-error.ts";

export async function checkUserRequest(request: FastifyRequest) {
  const { user } = request;
  if (!user) {
    throw new BadRequestError("Usuário não encontrado", 400);
  }

  return user;
}
