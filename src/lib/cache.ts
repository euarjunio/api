import { redis } from "./redis.ts";

// ── Cache Keys ────────────────────────────────────────────────────────
export const CacheKeys = {
  balance: (merchantId: string) => `cache:balance:${merchantId}`,
  profile: (userId: string) => `cache:profile:${userId}`,
  charges: (merchantId: string, page: number, limit: number, status?: string) =>
    `cache:charges:${merchantId}:p${page}:l${limit}${status ? `:s${status}` : ""}`,
  transactions: (merchantId: string, page: number, limit: number, type?: string, status?: string) =>
    `cache:transactions:${merchantId}:p${page}:l${limit}${type ? `:t${type}` : ""}${status ? `:s${status}` : ""}`,
  withdrawals: (merchantId: string, page: number, limit: number) =>
    `cache:withdrawals:${merchantId}:p${page}:l${limit}`,
} as const;

// ── TTLs (segundos) ──────────────────────────────────────────────────
export const CacheTTL = {
  balance: 15,
  profile: 60,
  charges: 10,
  transactions: 10,
  withdrawals: 15,
} as const;

// ── getOrSet Pattern ─────────────────────────────────────────────────

/**
 * Tenta buscar do cache Redis. Se não existir, executa o `fetcher`,
 * armazena o resultado no cache com TTL e retorna.
 *
 * Fail-open: se Redis estiver fora, executa o fetcher diretamente.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis down → fail-open, vai pro fetcher
  }

  const data = await fetcher();

  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch {
    // Redis down → silenciosamente ignora
  }

  return data;
}

// ── Invalidação ──────────────────────────────────────────────────────

/**
 * Invalida uma chave exata do cache.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // Redis down → fail-open
  }
}

/**
 * Invalida todas as chaves que matcham o pattern (usando SCAN para segurança).
 * Útil para invalidar todos os caches paginados de um merchant.
 *
 * Ex: invalidatePattern("cache:charges:merchant-123:*")
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Redis down → fail-open
  }
}

/**
 * Invalida todos os caches de um merchant (balance, charges, transactions, withdrawals).
 */
export async function invalidateMerchantCaches(merchantId: string): Promise<void> {
  await Promise.all([
    invalidate(CacheKeys.balance(merchantId)),
    invalidatePattern(`cache:charges:${merchantId}:*`),
    invalidatePattern(`cache:transactions:${merchantId}:*`),
    invalidatePattern(`cache:withdrawals:${merchantId}:*`),
  ]);
}

