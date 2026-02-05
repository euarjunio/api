import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { createRoute } from "./create.route.ts";

export const chargeRoutes: FastifyPluginAsyncZod = async (app) => {
    app.register(createRoute);
}