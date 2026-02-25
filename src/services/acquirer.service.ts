import { prisma } from "../lib/prisma.ts";
import { getProvider } from "../providers/acquirer.registry.ts";

/**
 * Serviço orquestrador para operações com adquirentes.
 * Contém lógica de negócio + persistência que não pertence ao provider puro.
 */
export class AcquirerService {
  /**
   * Fluxo: aprovar merchant → criar conta no adquirente (sem PIX key).
   * Determina o provider a partir do campo `acquirer` do merchant.
   */
  async setupMerchantAccount(merchantId: string): Promise<{ accountId: string }> {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new Error("Merchant não encontrado");

    // Se já tem conta, não cria de novo
    if (merchant.acquirerAccountId) {
      return { accountId: merchant.acquirerAccountId };
    }

    const provider = getProvider(merchant.acquirer);

    // 1. Token admin
    const adminToken = await provider.getAdminToken();

    // 2. Criar conta no adquirente
    const accountId = await provider.createAccount(adminToken, {
      id: merchant.id,
      document: merchant.document,
    });

    // 3. Salvar no banco
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { acquirerAccountId: accountId },
    });

    return { accountId };
  }
}

/** Singleton — use este ao invés de `new AcquirerService()` */
export const acquirerService = new AcquirerService();
