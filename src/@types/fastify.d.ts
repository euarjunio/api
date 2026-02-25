import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      id: string;
      role: "ADMIN" | "USER";
      merchantId?: string;
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      role: "ADMIN" | "USER";
      merchantId?: string;
    };
    saveRequestFiles: () => Promise<Array<any>>
    rawBody?: string
  }
}
