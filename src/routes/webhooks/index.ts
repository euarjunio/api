import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { transfeeraWebhookRoutes } from "./transfeera/index.ts";
import { merchantWebhookRoutes } from "./merchant/index.ts";

export const webhooksRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/webhooks/transfeera
  app.register(transfeeraWebhookRoutes, { prefix: "/transfeera" });

  // POST|GET|DELETE /v1/webhooks/merchant
  app.register(merchantWebhookRoutes, { prefix: "/merchant" });
};
