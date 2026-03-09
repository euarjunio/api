import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { getOrSet, CacheKeys, CacheTTL } from "../../lib/cache.ts";
import { normalizePixKeyStatus } from "../../providers/transfeera/transfeera.maps.ts";

export const getMerchantProfileRoute: FastifyPluginAsyncZod = async (app) => {
  app.get("/me", {
    schema: {
      tags: ["Merchants"],
      summary: "Obter perfil do logista",
      description: "Retorna o logista do usuário autenticado",
      response: {
        200: z.object({
          merchant: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            phone: z.string(),
            document: z.string(),
            documentType: z.string(),
            status: z.string(),
            kycStatus: z.string(),
            feeMode: z.string(),
            feeAmount: z.number(),
            withdrawFee: z.number().nullable().default(0),
            maxWithdrawAmount: z.number().nullable().default(0),
            dailyWithdrawLimit: z.number().nullable().default(0),
            monthlyWithdrawLimit: z.number().nullable().default(0),
            nightWithdrawLimit: z.number().nullable().default(0),
            minTicketAmount: z.number().nullable().default(0),
            maxTicketAmount: z.number().nullable().default(0),
            acquirer: z.string(),
            acquirerAccountId: z.string().nullable(),
            pixKey: z.string().nullable(),
            pixKeyStatus: z.string().nullable(),
            emailNotificationsEnabled: z.boolean(),
            createdAt: z.string().datetime(),
          }).nullable(),
        }),
        401: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = await checkUserRequest(request);

    const profile = await getOrSet(
      CacheKeys.profile(id),
      CacheTTL.profile,
      async () => {
        const merchant = await prisma.merchant.findUnique({
          where: { userId: id },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            document: true,
            documentType: true,
            status: true,
            kycStatus: true,
            feeMode: true,
            feeAmount: true,
            withdrawFee: true,
            maxWithdrawAmount: true,
            dailyWithdrawLimit: true,
            monthlyWithdrawLimit: true,
            nightWithdrawLimit: true,
            minTicketAmount: true,
            maxTicketAmount: true,
            acquirer: true,
            acquirerAccountId: true,
            pixKey: true,
            pixKeyStatus: true,
            emailNotificationsEnabled: true,
            createdAt: true,
          },
        });

        if (!merchant) return null;

        return {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          phone: merchant.phone,
          document: merchant.document,
          documentType: merchant.documentType,
          status: merchant.status,
          kycStatus: merchant.kycStatus,
          feeMode: merchant.feeMode,
          feeAmount: merchant.feeAmount,
          withdrawFee: merchant.withdrawFee ?? 0,
          maxWithdrawAmount: merchant.maxWithdrawAmount ?? 0,
          dailyWithdrawLimit: merchant.dailyWithdrawLimit ?? 0,
          monthlyWithdrawLimit: merchant.monthlyWithdrawLimit ?? 0,
          nightWithdrawLimit: merchant.nightWithdrawLimit ?? 0,
          minTicketAmount: merchant.minTicketAmount ?? 0,
          maxTicketAmount: merchant.maxTicketAmount ?? 0,
          acquirer: merchant.acquirer,
          acquirerAccountId: merchant.acquirerAccountId,
          pixKey: merchant.pixKey,
          pixKeyStatus: normalizePixKeyStatus(merchant.pixKeyStatus),
          emailNotificationsEnabled: merchant.emailNotificationsEnabled,
          createdAt: merchant.createdAt.toISOString(),
        };
      },
    );

    return reply.status(200).send({ merchant: profile });
  });
};
