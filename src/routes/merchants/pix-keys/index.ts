import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createPixKeyRoute } from "./create.ts";
import { getPixKeyRoute } from "./get.ts";

export const pixKeysRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/merchants/me/pix-keys
  app.register(createPixKeyRoute);

  // GET /v1/merchants/me/pix-keys
  app.register(getPixKeyRoute);
};
