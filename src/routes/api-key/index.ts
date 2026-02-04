import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { getRoute } from "./get.route.ts";
import { createRoute } from "./create.route.ts";
import { deleteRoute } from "./delete.route.ts";

export const apiKeyRoutes: FastifyPluginAsyncZod = async (app) => {
    app.register(getRoute);
    app.register(createRoute);
    app.register(deleteRoute);
}