import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { getProviderForMerchant } from "../../../providers/acquirer.registry.ts";
import { ledgerService } from "../../../services/ledger.service.ts";

export const acquirerBalanceRoute: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/admin/merchants/:id/acquirer-balance
  app.get("/:id/acquirer-balance", {
    schema: {
      tags: ["Admin"],
      summary: "Saldo real no adquirente",
      description: "Consulta o saldo real da conta do merchant no adquirente (valores em centavos). Útil para reconciliação com o Ledger interno.",
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({
          merchantId: z.string(),
          merchantName: z.string(),
          acquirer: z.object({
            balance: z.number(),
            blockedBalance: z.number(),
          }),
          ledger: z.object({
            pending: z.number(),
            available: z.number(),
            blocked: z.number(),
            total: z.number(),
          }),
        }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: { id: true, name: true, acquirerAccountId: true },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    if (!merchant.acquirerAccountId) {
      return reply.status(400).send({ message: "Merchant não possui conta no adquirente configurada." });
    }

    // Valida se o acquirerAccountId é um UUID válido (seeds usam IDs fake)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(merchant.acquirerAccountId)) {
      return reply.status(400).send({ message: "Conta no adquirente possui ID inválido (não é UUID). Reconfigure com /setup-acquirer." });
    }

    const provider = await getProviderForMerchant(id);
    const token = await provider.getMerchantToken(merchant.acquirerAccountId);

    const [acquirerBalance, ledger] = await Promise.all([
      provider.getAccountBalance(token),
      ledgerService.getBalance(id),
    ]);

    return reply.status(200).send({
      merchantId: merchant.id,
      merchantName: merchant.name,
      acquirer: acquirerBalance,
      ledger,
    });
  });
};
