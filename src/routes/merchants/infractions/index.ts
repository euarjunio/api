import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { listMerchantInfractionsRoute } from "./list.ts";
import { getMerchantInfractionRoute } from "./get-detail.ts";
import { analyzeMerchantInfractionRoute } from "./analyze.ts";

export const merchantInfractionsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/infractions
  app.register(listMerchantInfractionsRoute);

  // GET /v1/merchants/me/infractions/:id
  app.register(getMerchantInfractionRoute);

  // POST /v1/merchants/me/infractions/:id/analyze
  app.register(analyzeMerchantInfractionRoute);
};
