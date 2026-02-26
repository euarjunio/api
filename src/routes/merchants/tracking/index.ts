import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { listTrackingRoute } from "./list.ts";
import { createTrackingRoute } from "./create.ts";
import { updateTrackingRoute } from "./update.ts";
import { deleteTrackingRoute } from "./delete.ts";
import { trackingLogsRoute } from "./logs.ts";

export const trackingRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET    /v1/merchants/me/tracking
  app.register(listTrackingRoute);

  // POST   /v1/merchants/me/tracking
  app.register(createTrackingRoute);

  // PATCH  /v1/merchants/me/tracking/:provider
  app.register(updateTrackingRoute);

  // DELETE /v1/merchants/me/tracking/:provider
  app.register(deleteTrackingRoute);

  // GET    /v1/merchants/me/tracking/logs
  app.register(trackingLogsRoute);
};
