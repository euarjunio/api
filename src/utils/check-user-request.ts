import { FastifyRequest } from "fastify";
import { BadRequestError } from "../routes/errors/bad-request-error.ts";

export async function checkUserRequest(request: FastifyRequest) {
  const { user } = request;
  if (!user) {
    throw new BadRequestError("User not found", 400);
  }

  return user;
}
