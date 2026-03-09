import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyAdmin } from "../hooks/verify-admin.ts";
import { adminMerchantsRoutes } from "./merchants/index.ts";
import { adminInfractionsRoutes } from "./infractions/index.ts";
import { adminAuditLogsRoute } from "./audit-logs.ts";
import { adminDashboardRoute } from "./dashboard.ts";

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyAdmin);

  // /v1/admin/dashboard
  app.register(adminDashboardRoute, { prefix: "/dashboard" });

  // /v1/admin/merchants
  app.register(adminMerchantsRoutes, { prefix: "/merchants" });

  // /v1/admin/infractions
  app.register(adminInfractionsRoutes, { prefix: "/infractions" });

  // /v1/admin/audit-logs
  app.register(adminAuditLogsRoute, { prefix: "/audit-logs" });
};
