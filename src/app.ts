import { randomUUID } from "node:crypto";
import { env, isDevelopment } from "./config/env.ts";

import fastify from "fastify";
import { fastifyCors } from "@fastify/cors";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import rawBody from "fastify-raw-body";
import {
    hasZodFastifySchemaValidationErrors,
    isResponseSerializationError,
    jsonSchemaTransform,
    serializerCompiler,
    validatorCompiler,
} from "fastify-type-provider-zod";
import fastifyJwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { z } from "zod";

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { BadRequestError } from "./routes/errors/bad-request-error.ts";
import { NotFoundError } from "./routes/errors/not-found-error.ts";
import { ForbiddenError } from "./routes/errors/forbidden-error.ts";
import { AcquirerError } from "./providers/acquirer.error.ts";
import { captureError } from "./lib/sentry.ts";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { redis } from "./lib/redis.ts";
import { prisma } from "./lib/prisma.ts";
import {
    register,
    httpRequestDuration,
    httpRequestsTotal,
    registerBullMQQueue,
    collectBullMQMetrics,
} from "./lib/metrics.ts";

// ── BullMQ queue imports for metrics ─────────────────────────────────
import { webhookQueue } from "./lib/queues/webhook-queue.ts";
import { settlementQueue } from "./lib/queues/settlement-queue.ts";
import { auditQueue } from "./lib/audit.ts";
import { chargeExpirationQueue } from "./lib/queues/charge-expiration.ts";

registerBullMQQueue(webhookQueue);
registerBullMQQueue(settlementQueue);
registerBullMQQueue(auditQueue);
registerBullMQQueue(chargeExpirationQueue);

// ── Rotas RESTful ────────────────────────────────────────────────────
import { authRoutes } from "./routes/auth/index.ts";
import { merchantsRoutes } from "./routes/merchants/index.ts";
import { chargesRoutes } from "./routes/charges/index.ts";
import { apiKeysRoutes } from "./routes/api-keys/index.ts";
import { adminRoutes } from "./routes/admin/index.ts";
import { webhooksRoutes } from "./routes/webhooks/index.ts";
import { notificationsRoutes } from "./routes/notifications/index.ts";
import { customersRoutes } from "./routes/customers/index.ts";

// ── Headers sensíveis que NÃO devem aparecer nos logs ────────────────
const REDACTED_HEADERS = new Set([
    "authorization",
    "cookie",
    "x-api-key",
    "x-webhook-secret",
]);

// ── CORS: parsear ALLOWED_ORIGINS ────────────────────────────────────
function parseAllowedOrigins(): string[] | string {
    const raw = env.ALLOWED_ORIGINS;
    if (raw === "*") return "*";
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();

// ── Rate limit multiplier: sandbox é mais permissivo ─────────────────
const rateLimitMultiplier = isDevelopment ? 2 : 1;

// ── In-memory rate limit fallback when Redis is down ─────────────────
const memoryLimiter = new Map<string, { count: number; resetAt: number }>();
let redisAvailable = true;

redis.on("error", () => { redisAvailable = false; });
redis.on("connect", () => { redisAvailable = true; });
redis.on("ready", () => { redisAvailable = true; });

// Periodically clean expired in-memory entries
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of memoryLimiter) {
        if (val.resetAt <= now) memoryLimiter.delete(key);
    }
}, 60_000);

const server = fastify({
    logger: {
        ...(env.NODE_ENV === "development"
            ? {
                transport: {
                    target: "pino-pretty",
                    options: {
                        translateTime: "HH:MM:ss",
                        ignore: "pid,hostname",
                        colorize: true,
                        singleLine: false,
                        messageFormat: "{msg}",
                    },
                },
            }
            : {}),
        serializers: {
            req(request) {
                const safeHeaders: Record<string, unknown> = {};
                if (request.headers) {
                    for (const [key, value] of Object.entries(request.headers)) {
                        safeHeaders[key] = REDACTED_HEADERS.has(key.toLowerCase())
                            ? "[REDACTED]"
                            : value;
                    }
                }

                return {
                    method: request.method,
                    url: request.url,
                    headers: safeHeaders,
                };
            },
        },
    },
    genReqId: (request) => {
        const clientId = request.headers["x-request-id"] as string | undefined;
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return (clientId && UUID_RE.test(clientId)) ? clientId : randomUUID();
    },
    requestIdHeader: "x-request-id",
}).withTypeProvider<ZodTypeProvider>();

server.register(multipart, {
    limits: {
        fileSize: 1024 * 1024 * 5, // 5MB
    },
});

server.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
});

// ── Security Headers ──────────────────────────────────────────────────
server.register(helmet, {
    contentSecurityPolicy: false,
});

// ── CORS ──────────────────────────────────────────────────────────────
server.register(fastifyCors, {
    origin: allowedOrigins === "*"
        ? true
        : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key', 'x-request-id'],
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
});

// ── Hooks globais ─────────────────────────────────────────────────────

server.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);

    if (isDevelopment) {
        reply.header("x-environment", "development");
    }
});

server.addHook("onResponse", (request, reply, done) => {
    const route = request.routeOptions?.url ?? request.url;
    if (route === "/metrics" || route === "/health") {
        done();
        return;
    }

    const durationSec = reply.elapsedTime / 1000;
    const labels = {
        method: request.method,
        route,
        status: String(reply.statusCode),
    };

    httpRequestDuration.observe(labels, durationSec);
    httpRequestsTotal.inc(labels);

    if (reply.elapsedTime > 1000) {
        request.log.warn(
            { durationMs: reply.elapsedTime.toFixed(0), route },
            "Request lento",
        );
    }

    done();
});

// ── In-memory rate limit fallback (active when Redis is down) ────────
server.addHook("onRequest", async (request, reply) => {
    if (redisAvailable) return;

    const url = request.url;
    if (url === "/health" || url === "/metrics") return;

    const ip = request.ip;
    const now = Date.now();
    const windowMs = 60_000;
    let limit: number;

    if (url.startsWith("/v1/auth")) {
        limit = env.RATE_LIMIT_AUTH * rateLimitMultiplier;
    } else if (url.startsWith("/v1/charges")) {
        limit = env.RATE_LIMIT_CHARGE * rateLimitMultiplier;
    } else {
        limit = env.RATE_LIMIT_GLOBAL * rateLimitMultiplier;
    }

    const key = `mem:${ip}:${url.split("/").slice(0, 3).join("/")}`;
    let entry = memoryLimiter.get(key);
    if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        memoryLimiter.set(key, entry);
    }

    entry.count++;
    if (entry.count > limit) {
        return reply.status(429).send({ message: "Too many requests. Please try again later." });
    }
});

// ── Rate Limiting (Redis-backed) ──────────────────────────────────────
server.register(rateLimit, {
    global: true,
    timeWindow: "1 minute",
    max: (request, _key) => {
        if (request.url.startsWith("/v1/auth")) return env.RATE_LIMIT_AUTH * rateLimitMultiplier;
        if (request.url.startsWith("/v1/charges")) return env.RATE_LIMIT_CHARGE * rateLimitMultiplier;
        if (request.url.startsWith("/v1/webhooks/transfeera")) return 300 * rateLimitMultiplier;
        return env.RATE_LIMIT_GLOBAL * rateLimitMultiplier;
    },
    keyGenerator: (request) => {
        if (request.url.startsWith("/v1/charges")) {
            const authHeader = request.headers.authorization ?? "";
            const token = authHeader.replace(/^Bearer\s+/i, "");
            if (token.startsWith("lk_")) return `charge:${token.slice(0, 20)}`;
            return `charge:${request.ip}`;
        }

        if (request.url.startsWith("/v1/webhooks/transfeera")) {
            return `webhook-transfeera:${request.ip}`;
        }

        if (request.url.startsWith("/v1/auth")) return `auth:${request.ip}`;

        return request.ip;
    },
    allowList: (request) => {
        return request.url === "/health";
    },
    redis,
    skipOnError: true,
    errorResponseBuilder: (_request, context) => ({
        message: "Too many requests. Please try again later.",
        retryAfter: Math.ceil(context.ttl / 1000),
    }),
});

// ── Swagger (controlado por ENABLE_SWAGGER) ───────────────────────────
if (env.ENABLE_SWAGGER && isDevelopment) {
    server.register(fastifySwagger, {
        openapi: {
            info: {
                title: "LIQUERA API",
                version: "1.0.0",
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                },
            },
        },
        transform: jsonSchemaTransform,
    });

    server.register(fastifySwaggerUi, {
        routePrefix: "/docs",
    });
}

// ── Prometheus Metrics (Fly.io Grafana scrapes this) ─────────────────
server.get("/metrics", { logLevel: "silent" }, async (request, reply) => {
    const flyHeader = request.headers["fly-forwarded-port"];
    const ip = request.ip;
    const isInternal = flyHeader || ip === "127.0.0.1" || ip === "::1" || ip?.startsWith("fdaa:");
    if (!isInternal && !isDevelopment) {
        return reply.status(403).send({ message: "Forbidden" });
    }

    // Collect BullMQ queue metrics before returning
    await collectBullMQMetrics();

    const metrics = await register.metrics();
    return reply
        .header("content-type", register.contentType)
        .send(metrics);
});

// ── Health Check (robusto: Redis + Postgres) ──────────────────────────
server.get(
    "/health",
    {
        schema: {
            tags: ["Health"],
            summary: "Health check",
            description: "Verifica o status da API, Redis e PostgreSQL",
            response: {
                200: z.object({
                    status: z.string(),
                    environment: z.string(),
                    timestamp: z.string(),
                    services: z.object({
                        redis: z.enum(["up", "down"]),
                        postgres: z.enum(["up", "down"]),
                    }),
                }),
                503: z.object({
                    status: z.string(),
                    environment: z.string(),
                    timestamp: z.string(),
                    services: z.object({
                        redis: z.enum(["up", "down"]),
                        postgres: z.enum(["up", "down"]),
                    }),
                }),
            },
        },
    },
    async (_request, reply) => {
        let redisOk = false;
        let postgresOk = false;

        try {
            const pong = await redis.ping();
            redisOk = pong === "PONG";
        } catch { /* down */ }

        try {
            await prisma.$queryRaw`SELECT 1`;
            postgresOk = true;
        } catch { /* down */ }

        const allHealthy = redisOk && postgresOk;

        const body = {
            status: allHealthy ? "ok" : "degraded",
            environment: env.NODE_ENV,
            timestamp: new Date().toISOString(),
            services: {
                redis: redisOk ? "up" as const : "down" as const,
                postgres: postgresOk ? "up" as const : "down" as const,
            },
        };

        return reply.status(allHealthy ? 200 : 503).send(body);
    },
);

// ── Registro de Rotas (RESTful) ──────────────────────────────────────
server.register(authRoutes, { prefix: "/v1/auth" });
server.register(merchantsRoutes, { prefix: "/v1/merchants" });
server.register(chargesRoutes, { prefix: "/v1/charges" });
server.register(apiKeysRoutes, { prefix: "/v1/api-keys" });
server.register(adminRoutes, { prefix: "/v1/admin" });
server.register(webhooksRoutes, { prefix: "/v1/webhooks" });
server.register(notificationsRoutes, { prefix: "/v1/notifications" });
server.register(customersRoutes, { prefix: "/v1/customers" });

server.setErrorHandler((error: any, request, reply) => {
    request.log.error({ err: error }, "Unhandled error");

    if (hasZodFastifySchemaValidationErrors(error)) {
        request.log.warn(
            { url: request.url, method: request.method, issues: error.validation },
            "Request validation failed",
        );
        return reply.code(400).send({
            message: "Request doesn't match the schema",
            error: "VALIDATION_ERROR",
            statusCode: 400,
            details: { issues: error.validation, method: request.method, url: request.url },
        });
    }

    if (isResponseSerializationError(error)) {
        request.log.error(
            {
                url: request.url,
                method: request.method,
                issues: error.cause?.issues,
            },
            "Response doesn't match the schema",
        );
        captureError(error, {
            url: request.url,
            method: request.method,
        });
        return reply.status(500).send({
            message: "Internal Server Error",
        });
    }

    if (error instanceof BadRequestError) {
        request.log.warn({ url: request.url, method: request.method, err: error.message }, "Bad request");
        return reply.status(error.statusCode).send({ message: error.message });
    }

    if (error instanceof NotFoundError) {
        return reply.status(404).send({ message: error.message });
    }

    if (error instanceof ForbiddenError) {
        return reply.status(403).send({ message: error.message });
    }

    if (error instanceof AcquirerError) {
        request.log.error(
            {
                url: request.url,
                method: request.method,
                provider: error.provider,
                operation: error.operation,
                acquirerStatus: error.acquirerStatus,
                acquirerBody: error.acquirerBody,
            },
            `[ACQUIRER:${error.provider.toUpperCase()}] ${error.message}`,
        );
        return reply.status(error.statusCode).send({
            message: error.message,
            error: "ACQUIRER_ERROR",
        });
    }

    captureError(error, {
        url: request.url,
        method: request.method,
        userId: request.user?.id,
    });

    request.log.error(
        { url: request.url, method: request.method, err: error?.message, stack: error?.stack },
        "Request error",
    );

    // Persistir erro no banco de forma assíncrona (fire-and-forget)
    const SENSITIVE_KEYS = new Set(["password", "totpCode", "token", "secret", "authorization", "newPassword", "currentPassword"]);
    const sanitizeBody = (body: any): any => {
        if (!body || typeof body !== "object") return body;
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(body)) {
            result[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : v;
        }
        return result;
    };
    prisma.errorLog.create({
        data: {
            statusCode: 500,
            message: error?.message ?? "Internal Server Error",
            stack: error?.stack ?? null,
            route: `${request.method} ${request.url}`,
            requestId: request.id ?? null,
            userId: request.user?.id ?? null,
            metadata: request.body ? sanitizeBody(request.body) : null,
        },
    }).catch(() => { /* silencioso — não deve quebrar a resposta */ });

    return reply.status(500).send({
        message: "Internal Server Error",
        ...(isDevelopment ? { error: error?.message } : {}),
    });
});

export { server }
