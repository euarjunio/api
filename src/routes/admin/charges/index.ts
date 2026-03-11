import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { syncChargesRoute } from "./sync.ts";

export const adminChargesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.register(syncChargesRoute);
};
