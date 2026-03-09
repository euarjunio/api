// ── Authentication & Security ────────────────────────────────────────
export const MAX_2FA_ATTEMPTS = 5;
export const LOCKOUT_TTL_SECONDS = 15 * 60; // 15 minutes
export const API_KEY_CACHE_TTL = 60; // seconds
export const SSE_TOKEN_TTL = 60; // seconds
export const TEMP_TOKEN_EXPIRY = "5m";

// ── File Upload ──────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ── Charge Defaults ──────────────────────────────────────────────────
export const CHARGE_EXPIRES_MIN = 60; // 1 minute
export const CHARGE_EXPIRES_MAX = 604_800; // 7 days
export const CHARGE_EXPIRES_DEFAULT = 86_400; // 24 hours
export const CHARGE_AMOUNT_MAX = 100_000_000; // R$ 1.000.000,00

// ── Storage ──────────────────────────────────────────────────────────
export const SIGNED_URL_EXPIRY = 3600; // 1 hour

// ── Database / Resilience ────────────────────────────────────────────
export const PG_POOL_MAX = 20;
export const PG_IDLE_TIMEOUT_MS = 30_000;
export const PG_CONNECTION_TIMEOUT_MS = 10_000;
export const SLOW_QUERY_THRESHOLD_MS = 500;
export const CIRCUIT_BREAKER_THRESHOLD = 5;
export const CIRCUIT_BREAKER_RESET_MS = 30_000;

// ── SSE / Notifications ─────────────────────────────────────────────
export const MAX_GLOBAL_SSE = 500;
export const MAX_PER_MERCHANT_SSE = 5;

// ── Webhooks ─────────────────────────────────────────────────────────
export const WEBHOOK_REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
export const WEBHOOK_RECOVERY_INTERVAL_MS = 30_000;
export const WEBHOOK_RECOVERY_BATCH_SIZE = 10;
export const WEBHOOK_RECOVERY_MAX_ATTEMPTS = 5;

// ── Rate Limiting ────────────────────────────────────────────────────
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const SLOW_REQUEST_THRESHOLD_MS = 1000;

// ── Charge Expiration Job ────────────────────────────────────────────
export const CHARGE_EXPIRATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ── Pagination ───────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
