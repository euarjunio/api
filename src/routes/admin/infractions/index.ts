import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyAdmin } from "../../hooks/verify-admin.ts";
import { listAdminInfractionsRoute } from "./list.ts";
import { getAdminInfractionRoute } from "./get-detail.ts";
import { approveInfractionRoute } from "./approve.ts";
import { syncInfractionsRoute } from "./sync.ts";

export const adminInfractionsRoutes: FastifyPluginAsyncZod = async (app) => {
  // Todas as rotas de infrações admin exigem ADMIN
  app.addHook("onRequest", verifyAdmin);

  // GET /v1/admin/infractions
  app.register(listAdminInfractionsRoute);

  // GET /v1/admin/infractions/:id
  app.register(getAdminInfractionRoute);

  // POST /v1/admin/infractions/:id/approve
  app.register(approveInfractionRoute);

  // POST /v1/admin/infractions/sync
  app.register(syncInfractionsRoute);
};
