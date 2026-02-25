import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // ── Core ────────────────────────────────────────────────────────────
  DATABASE_URL: z.url(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(80),
  API_BASE_URL: z.url().optional(),         // URL pública da API (ex: https://api.liquera.com.br)

  // ── Auth ────────────────────────────────────────────────────────────
  JWT_SECRET: z.string().min(1, "JWT_SECRET é obrigatório"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // ── CORS ────────────────────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().default("*"),  // Comma-separated origins (ex: "https://app.liquera.com.br,https://admin.liquera.com.br")

  // ── Transfeera ──────────────────────────────────────────────────────
  URL_TRANSFEERA: z.url(),
  URL_TRANSFEERA_AUTH: z.url(),
  TRANSFEERA_CLIENT_ID: z.string(),
  TRANSFEERA_CLIENT_SECRET: z.string(),
  TRANSFEERA_CUSTOMER_ID: z.string(),
  PLATFORM_PIX_KEY: z.string(),
  PLATFORM_PIX_KEY_TYPE: z.enum(["EMAIL", "CPF", "CNPJ", "PHONE", "CHAVE_ALEATORIA"]),
  TRANSFEERA_WEBHOOK_SECRET: z.string().optional(),

  // ── Webhooks ────────────────────────────────────────────────────────
  MERCHANT_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),
  MERCHANT_WEBHOOK_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

  // ── Redis ───────────────────────────────────────────────────────────
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // ── Rate Limit ──────────────────────────────────────────────────────
  RATE_LIMIT_GLOBAL: z.coerce.number().int().min(1).default(100),       // req/min por IP
  RATE_LIMIT_CHARGE: z.coerce.number().int().min(1).default(30),        // req/min por merchant na /charge
  RATE_LIMIT_AUTH: z.coerce.number().int().min(1).default(10),          // req/min por IP na /auth

  // ── Settlement ──────────────────────────────────────────────────────
  SETTLEMENT_DELAY_MS: z.coerce.number().int().min(0).default(30000),   // Delay para liquidar saldo (default 30s)
  MIN_WITHDRAW_AMOUNT: z.coerce.number().int().min(1).default(100),     // Saque mínimo em centavos (R$ 1,00)

  // ── Storage (Cloudflare R2) ─────────────────────────────────────────
  R2_BUCKET_NAME: z.string(),
  R2_ENDPOINT: z.url(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),

  // ── Observability ───────────────────────────────────────────────────
  SENTRY_DSN: z.string().optional(),          // Se vazio, Sentry fica desabilitado
  ENABLE_SWAGGER: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),           // Swagger habilitado por padrão em sandbox
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  const data = parsed.data;

  // ── Validações obrigatórias em produção ──────────────────────────
  if (data.NODE_ENV === "production") {
    const errors: string[] = [];

    if (!data.TRANSFEERA_WEBHOOK_SECRET) {
      errors.push("TRANSFEERA_WEBHOOK_SECRET é obrigatório em produção");
    }
    if (!data.SENTRY_DSN) {
      errors.push("SENTRY_DSN é obrigatório em produção");
    }
    if (data.ALLOWED_ORIGINS === "*") {
      errors.push("ALLOWED_ORIGINS não pode ser '*' em produção — defina as origens permitidas");
    }
    if (data.JWT_SECRET.length < 32) {
      errors.push("JWT_SECRET deve ter pelo menos 32 caracteres em produção");
    }
    if (!data.API_BASE_URL) {
      errors.push("API_BASE_URL é obrigatório em produção");
    }

    if (errors.length > 0) {
      console.error("❌ Production environment validation failed:");
      errors.forEach((e) => console.error(`   → ${e}`));
      process.exit(1);
    }
  }

  return data;
}

export const env = validateEnv();

// ── Helpers ───────────────────────────────────────────────────────────
export const isDevelopment = env.NODE_ENV === "development";
export const isProduction = env.NODE_ENV === "production";
