import { Redis } from "ioredis";
import { env } from "../config/env.ts";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Requerido pelo BullMQ
});

redis.on("connect", () => {
  console.log("🔴 Redis connected");
});

redis.on("error", (err) => {
  console.error("🔴 Redis connection error:", err.message);
});
