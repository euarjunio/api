import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createWithdrawalRoute } from "./create.ts";
import { listWithdrawalsRoute } from "./list.ts";

export const withdrawalsRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/merchants/me/withdrawals
  app.register(createWithdrawalRoute);

  // GET /v1/merchants/me/withdrawals
  app.register(listWithdrawalsRoute);
};
