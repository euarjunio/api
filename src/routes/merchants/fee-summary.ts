import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";

export const feeSummaryRoute: FastifyPluginAsyncZod = async (app) => {
  app.get("/me/fee-summary", {
    schema: {
      tags: ["Merchants"],
      summary: "Resumo de taxas pagas",
      description: "Retorna o total de taxas pagas pelo merchant (transação e saque)",
      response: {
        200: z.object({
          totalFeePaid: z.number(),
          totalWithdrawFeePaid: z.number(),
          totalTransactionFeePaid: z.number(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    const [withdrawFeeResult, transactionFeeResult] = await Promise.all([
      prisma.ledger.aggregate({
        where: {
          merchantId: merchant.id,
          type: "FEE",
          metadata: { path: ["feeType"], equals: "WITHDRAW_FEE" },
        },
        _sum: { amount: true },
      }),
      prisma.ledger.aggregate({
        where: {
          merchantId: merchant.id,
          type: "FEE",
          NOT: { metadata: { path: ["feeType"], equals: "WITHDRAW_FEE" } },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalWithdrawFeePaid = Math.abs(withdrawFeeResult._sum.amount ?? 0);
    const totalTransactionFeePaid = Math.abs(transactionFeeResult._sum.amount ?? 0);

    return reply.status(200).send({
      totalFeePaid: totalWithdrawFeePaid + totalTransactionFeePaid,
      totalWithdrawFeePaid,
      totalTransactionFeePaid,
    });
  });
};
