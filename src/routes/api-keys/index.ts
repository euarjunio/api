import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createApiKeyRoute } from "./create.ts";
import { listApiKeysRoute } from "./list.ts";
import { deleteApiKeyRoute } from "./delete.ts";
import { revealApiKeyRoute } from "./reveal.ts";

export const apiKeysRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/api-keys
  app.register(createApiKeyRoute);

  // GET /v1/api-keys
  app.register(listApiKeysRoute);

  // POST /v1/api-keys/:id/reveal
  app.register(revealApiKeyRoute);

  // DELETE /v1/api-keys/:id
  app.register(deleteApiKeyRoute);
};
