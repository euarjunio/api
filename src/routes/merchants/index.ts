import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authenticate } from "../hooks/authenticate.ts";

import { createMerchantRoute } from "./create.ts";
import { getMerchantProfileRoute } from "./get-profile.ts";
import { updateMerchantProfileRoute } from "./update-profile.ts";
import { documentsRoutes } from "./documents/index.ts";
import { pixKeysRoutes } from "./pix-keys/index.ts";
import { balanceRoutes } from "./balance/index.ts";
import { withdrawalsRoutes } from "./withdrawals/index.ts";
import { merchantInfractionsRoutes } from "./infractions/index.ts";
import { trackingRoutes } from "./tracking/index.ts";

export const merchantsRoutes: FastifyPluginAsyncZod = async (app) => {
  // Todas as rotas de merchants precisam de autenticação
  app.addHook("onRequest", authenticate);

  // POST /v1/merchants
  app.register(createMerchantRoute);

  // GET /v1/merchants/me
  app.register(getMerchantProfileRoute);

  // PATCH /v1/merchants/me
  app.register(updateMerchantProfileRoute);

  // Sub-recursos
  app.register(documentsRoutes, { prefix: "/me/documents" });
  app.register(pixKeysRoutes, { prefix: "/me/pix-keys" });
  app.register(balanceRoutes, { prefix: "/me/balance" });
  app.register(withdrawalsRoutes, { prefix: "/me/withdrawals" });
  app.register(merchantInfractionsRoutes, { prefix: "/me/infractions" });
  app.register(trackingRoutes, { prefix: "/me/tracking" });
};
