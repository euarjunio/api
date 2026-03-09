import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { listNotificationsRoute } from "./list.ts";
import { streamNotificationsRoute } from "./stream.ts";
import { markReadRoute } from "./mark-read.ts";
import { markAllReadRoute } from "./mark-all-read.ts";
import { unreadCountRoute } from "./unread-count.ts";
import { authenticate } from "../hooks/authenticate.ts";

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  // Rotas autenticadas (exceto stream que faz auth manual via SSE token)
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    // Stream does its own auth (SSE token from Redis)
    if (path.endsWith("/stream")) {
      return;
    }
    return authenticate(request, reply);
  });

  app.register(listNotificationsRoute);
  app.register(streamNotificationsRoute);
  app.register(markReadRoute);
  app.register(markAllReadRoute);
  app.register(unreadCountRoute);
};
