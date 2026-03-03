import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { listCustomersRoute } from "./list.ts";
import { getCustomerDetailRoute } from "./get-detail.ts";
import { createCustomerRoute } from "./create.ts";

export const customersRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/customers
  app.register(createCustomerRoute);

  // GET /v1/customers
  app.register(listCustomersRoute);

  // GET /v1/customers/:id
  app.register(getCustomerDetailRoute);
};
