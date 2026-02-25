import type { AcquirerProvider } from "./acquirer.interface.ts";
import { TransfeeraProvider } from "./transfeera/index.ts";
import { prisma } from "../lib/prisma.ts";

// ── Singleton instances ──────────────────────────────────────────────
const providers = new Map<string, AcquirerProvider>();

function ensureProvider(name: string): AcquirerProvider {
  let provider = providers.get(name);
  if (provider) return provider;

  switch (name) {
    case "transfeera":
      provider = new TransfeeraProvider();
      break;
    default:
      throw new Error(`Acquirer provider "${name}" não registrado`);
  }

  providers.set(name, provider);
  return provider;
}

// ── API Pública ──────────────────────────────────────────────────────

/**
 * Retorna o provider pelo nome.
 * Ex: getProvider("transfeera")
 */
export function getProvider(name: string): AcquirerProvider {
  return ensureProvider(name);
}

/**
 * Retorna o provider associado ao merchant (campo `acquirer` no banco).
 * Busca o merchant e retorna o provider correto.
 */
export async function getProviderForMerchant(merchantId: string): Promise<AcquirerProvider> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { acquirer: true },
  });

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} não encontrado`);
  }

  return ensureProvider(merchant.acquirer);
}

/**
 * Retorna o provider padrão (transfeera por enquanto).
 * Útil para operações admin que não dependem de um merchant específico.
 */
export function getDefaultProvider(): AcquirerProvider {
  return ensureProvider("transfeera");
}

/**
 * Lista todos os providers registrados.
 */
export function listProviders(): string[] {
  return ["transfeera"];
}
