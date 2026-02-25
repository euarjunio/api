import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getBalanceRoute } from "./get.ts";
import { listTransactionsRoute } from "./transactions.ts";

export const balanceRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/merchants/me/balance
  app.register(getBalanceRoute);

  // GET /v1/merchants/me/balance/transactions
  app.register(listTransactionsRoute);
};
