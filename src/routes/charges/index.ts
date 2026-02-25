import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createChargeRoute } from "./create.ts";
import { listChargesRoute } from "./list.ts";

export const chargesRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/charges
  app.register(createChargeRoute);

  // GET /v1/charges
  app.register(listChargesRoute);
};
