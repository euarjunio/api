import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { createRoute } from './create.route.ts';
import { getListRoute } from './get.route.ts';
import { patchRoute } from './patch.route.ts';

export const merchantRoutes: FastifyPluginAsyncZod = async (app) => {
    app.register(getListRoute);
    app.register(patchRoute);
    app.register(createRoute);
}