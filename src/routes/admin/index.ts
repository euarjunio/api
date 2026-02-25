import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { adminMerchantsRoutes } from "./merchants/index.ts";
import { adminInfractionsRoutes } from "./infractions/index.ts";

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // /v1/admin/merchants
  app.register(adminMerchantsRoutes, { prefix: "/merchants" });

  // /v1/admin/infractions
  app.register(adminInfractionsRoutes, { prefix: "/infractions" });
};
