import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { transfeeraHandlerRoute } from "./handler.ts";

export const transfeeraWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/webhooks/transfeera
  app.register(transfeeraHandlerRoute);
};
