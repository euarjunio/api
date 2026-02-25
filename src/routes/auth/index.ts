import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { registerRoute } from "./register.ts";
import { loginRoute } from "./login.ts";

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.register(registerRoute);
  app.register(loginRoute);
};
