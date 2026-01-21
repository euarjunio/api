import { FastifyRequest } from "fastify";

export async function checkUserRequest(request: FastifyRequest) {
  const { user } = request;
  if (!user) {
    throw new Error("User not found");
  }
  
  return user;
}
