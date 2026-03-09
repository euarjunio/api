import { redis } from "./redis.ts";

const PREFIX = "jwt:invalidated:";
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (max JWT lifetime)

/**
 * Invalidates all JWTs issued for a user before the current moment.
 * Any JWT with `iat` before this timestamp will be rejected.
 */
export async function invalidateUserTokens(userId: string): Promise<void> {
  try {
    await redis.set(`${PREFIX}${userId}`, Date.now().toString(), "EX", MAX_TTL_SECONDS);
  } catch {
    // Redis down — tokens can't be invalidated, but this is non-critical
    // (tokens will expire naturally via JWT expiry)
    console.warn(`[JWT-BLACKLIST] Failed to invalidate tokens for user ${userId} (Redis offline)`);
  }
}

/**
 * Checks whether a JWT is invalidated (issued before the user's invalidation timestamp).
 * Returns true if the token should be REJECTED.
 */
export async function isTokenInvalidated(userId: string, iatSeconds: number): Promise<boolean> {
  try {
    const raw = await redis.get(`${PREFIX}${userId}`);
    if (!raw) return false;
    return iatSeconds * 1000 <= parseInt(raw, 10);
  } catch {
    // Redis down — allow the token (fail-open)
    return false;
  }
}
