import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      id: string;
      role: "ADMIN" | "USER";
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      role: "ADMIN" | "USER";
    };
  }
}