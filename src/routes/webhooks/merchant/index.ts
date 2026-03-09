import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authenticate } from "../../hooks/authenticate.ts";
import { listWebhookEventsRoute } from "./events.ts";
import { createMerchantWebhookRoute } from "./create.ts";
import { getMerchantWebhookRoute } from "./get.ts";
import { updateMerchantWebhookRoute } from "./update.ts";
import { deleteMerchantWebhookRoute } from "./delete.ts";
import { revealWebhookSecretRoute } from "./reveal.ts";

export const merchantWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate);

  // GET  /v1/webhooks/merchant/events    — listar eventos disponíveis
  app.register(listWebhookEventsRoute);

  // POST /v1/webhooks/merchant           — criar webhook
  app.register(createMerchantWebhookRoute);

  // GET  /v1/webhooks/merchant           — listar webhooks
  app.register(getMerchantWebhookRoute);

  // POST /v1/webhooks/merchant/:id/reveal — revelar secret com verificação
  app.register(revealWebhookSecretRoute);

  // PATCH  /v1/webhooks/merchant/:id     — atualizar webhook
  app.register(updateMerchantWebhookRoute);

  // DELETE /v1/webhooks/merchant/:id     — remover webhook
  app.register(deleteMerchantWebhookRoute);
};
