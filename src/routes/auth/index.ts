import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { registerRoute } from './register.route.ts'
import { loginRoute } from './login.route.ts'

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
    app.register(registerRoute);
    app.register(loginRoute);
}