import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { verifyAdmin } from "../hooks/verify-admin.ts";

export const adminDashboardRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyAdmin);

  // GET /v1/admin/dashboard
  app.get("/", {
    schema: {
      tags: ["Admin"],
      summary: "Dashboard do admin",
      description: "Retorna métricas resumidas para o painel administrativo.",
      response: {
        200: z.object({
          totalMerchants: z.number(),
          activeMerchants: z.number(),
          pendingKyc: z.number(),
          totalInfractions: z.number(),
          totalVolume: z.number(),
          totalCharges24h: z.number(),
          paidCharges24h: z.number(),
          totalFeesCollected: z.number(),
        }),
      },
    },
  }, async (_request, reply) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalMerchants,
      activeMerchants,
      pendingKyc,
      totalInfractions,
      volumeResult,
      totalCharges24h,
      paidCharges24h,
      feesResult,
    ] = await Promise.all([
      prisma.merchant.count(),
      prisma.merchant.count({ where: { status: "ACTIVE", kycStatus: "APPROVED" } }),
      prisma.merchant.count({ where: { kycStatus: { in: ["PENDING", "UNDER_REVIEW"] } } }),
      prisma.infraction.count(),
      prisma.charges.aggregate({
        _sum: { amount: true },
        where: { status: "PAID" },
      }),
      prisma.charges.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.charges.count({
        where: { status: "PAID", paidAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.ledger.aggregate({
        _sum: { amount: true },
        where: { type: "FEE" },
      }),
    ]);

    return reply.status(200).send({
      totalMerchants,
      activeMerchants,
      pendingKyc,
      totalInfractions,
      totalVolume: volumeResult._sum.amount ?? 0,
      totalCharges24h,
      paidCharges24h,
      totalFeesCollected: Math.abs(feesResult._sum.amount ?? 0),
    });
  });
};
