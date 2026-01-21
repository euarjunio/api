import "dotenv/config";
import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(80),

  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("7d"),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

export const env = validateEnv();
