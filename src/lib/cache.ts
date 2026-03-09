import { redis } from "./redis.ts";

// ── Cache Keys ────────────────────────────────────────────────────────
export const CacheKeys = {
  balance: (merchantId: string) => `cache:balance:${merchantId}`,
  profile: (userId: string) => `cache:profile:${userId}`,
  charges: (merchantId: string, page: number, limit: number, status?: string, startDate?: string, endDate?: string) =>
    `cache:charges:${merchantId}:p${page}:l${limit}${status ? `:s${status}` : ""}${startDate ? `:from${startDate}` : ""}${endDate ? `:to${endDate}` : ""}`,
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
//
// Existem 3 estratégias de invalidação, cada uma para um cenário diferente:
//
// 1. invalidate(key)
//    Remove UMA chave exata. Use quando você sabe a chave completa.
//    Ex: invalidate(CacheKeys.balance("merchant-123"))
//
// 2. invalidatePattern(pattern)
//    Remove TODAS as chaves que casam com um glob pattern via SCAN.
//    Mais lento (I/O proporcional ao número de chaves), mas necessário
//    para invalidar caches paginados onde a chave inclui page/limit/filtros.
//    Ex: invalidatePattern("cache:charges:merchant-123:*")
//    Use quando um evento afeta múltiplas variações paginadas de um recurso.
//
// 3. invalidateMerchantCaches(merchantId)
//    Atalho que invalida TODOS os caches de um merchant de uma vez:
//    balance (exato) + charges, transactions, withdrawals (pattern).
//    Use após operações que afetam o saldo ou listagens do merchant
//    (ex: saque, pagamento recebido, estorno).
//    Não use para invalidações pontuais — prefira invalidate() ou
//    invalidatePattern() quando só um tipo de cache foi afetado.

/**
 * Remove uma chave exata do cache.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // Redis down → fail-open
  }
}

/**
 * Remove todas as chaves que matcham o pattern (via SCAN, seguro em produção).
 * Custo: O(N) onde N é o número de chaves no Redis que casam com o pattern.
 * Prefira invalidate() para chaves exatas.
 *
 * @example invalidatePattern("cache:charges:merchant-123:*")
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
 * Invalida TODOS os caches de um merchant: balance + charges + transactions + withdrawals.
 * Use após operações que afetam saldo ou listagens (saque, pagamento, estorno).
 * Para invalidar apenas um tipo, use invalidate() ou invalidatePattern() diretamente.
 */
export async function invalidateMerchantCaches(merchantId: string): Promise<void> {
  await Promise.all([
    invalidate(CacheKeys.balance(merchantId)),
    invalidatePattern(`cache:charges:${merchantId}:*`),
    invalidatePattern(`cache:transactions:${merchantId}:*`),
    invalidatePattern(`cache:withdrawals:${merchantId}:*`),
  ]);
}

