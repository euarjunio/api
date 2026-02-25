import { randomUUID } from "node:crypto";
import { env, isDevelopment } from "./config/env.ts";

import fastify from "fastify";
import { fastifyCors } from "@fastify/cors";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import rawBody from "fastify-raw-body";
import {
    hasZodFastifySchemaValidationErrors,
    jsonSchemaTransform,
    serializerCompiler,
    validatorCompiler,
} from "fastify-type-provider-zod";
import fastifyJwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { z } from "zod";

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { BadRequestError } from "./routes/errors/bad-request-error.ts";
import { AcquirerError } from "./providers/acquirer.error.ts";
import { captureError } from "./lib/sentry.ts";
import rateLimit from "@fastify/rate-limit";
import { redis } from "./lib/redis.ts";
import { prisma } from "./lib/prisma.ts";

// ── Rotas RESTful ────────────────────────────────────────────────────
import { authRoutes } from "./routes/auth/index.ts";
import { merchantsRoutes } from "./routes/merchants/index.ts";
import { chargesRoutes } from "./routes/charges/index.ts";
import { apiKeysRoutes } from "./routes/api-keys/index.ts";
import { adminRoutes } from "./routes/admin/index.ts";
import { webhooksRoutes } from "./routes/webhooks/index.ts";

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
                // Sanitizar headers: remover tokens, JWTs e API Keys dos logs
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
    // Gera request ID automaticamente se não vier no header
    genReqId: (request) => {
        return (request.headers["x-request-id"] as string) ?? randomUUID();
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

// ── CORS ──────────────────────────────────────────────────────────────
server.register(fastifyCors, {
    origin: allowedOrigins === "*"
        ? true                    // Aceita qualquer origem (sandbox/dev)
        : allowedOrigins,         // Lista explícita de origens (produção)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key', 'x-request-id'],
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
});

// ── Hooks globais ─────────────────────────────────────────────────────

// X-Request-Id + X-Environment em cada resposta
server.addHook("onSend", async (request, reply) => {
    // Propagar request ID para o response
    reply.header("x-request-id", request.id);

    // Em sandbox, identificar o ambiente no header
    if (isDevelopment) {
        reply.header("x-environment", "development");
    }
});

// ── Rate Limiting (Redis-backed) ──────────────────────────────────────
server.register(rateLimit, {
    global: true,
    timeWindow: "1 minute",
    max: (request, _key) => {
        if (request.url.startsWith("/v1/auth")) return env.RATE_LIMIT_AUTH * rateLimitMultiplier;
        if (request.url.startsWith("/v1/charges")) return env.RATE_LIMIT_CHARGE * rateLimitMultiplier;
        return env.RATE_LIMIT_GLOBAL * rateLimitMultiplier;
    },
    keyGenerator: (request) => {
        // Rotas de cobrança: limita por API Key quando disponível (mais justo)
        if (request.url.startsWith("/v1/charges")) {
            const authHeader = request.headers.authorization ?? "";
            const token = authHeader.replace(/^Bearer\s+/i, "");
            if (token.startsWith("lk_")) return `charge:${token.slice(0, 20)}`;
            return `charge:${request.ip}`;
        }

        // Rotas de auth: chave específica por IP (anti brute-force)
        if (request.url.startsWith("/v1/auth")) return `auth:${request.ip}`;

        // Global: por IP
        return request.ip;
    },
    // Pula health check e webhooks da Transfeera
    allowList: (request) => {
        return request.url === "/health" || request.url.startsWith("/v1/webhooks/transfeera");
    },
    redis,
    skipOnError: true, // fail-open: se Redis cair, não bloqueia requests
    errorResponseBuilder: (_request, context) => ({
        message: "Too many requests. Please try again later.",
        retryAfter: Math.ceil(context.ttl / 1000),
    }),
});

// ── Swagger (controlado por ENABLE_SWAGGER) ───────────────────────────
if (env.ENABLE_SWAGGER) {
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

        // Checar Redis
        try {
            const pong = await redis.ping();
            redisOk = pong === "PONG";
        } catch { /* down */ }

        // Checar Postgres
        try {
            await prisma.$queryRawUnsafe("SELECT 1");
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

server.setErrorHandler((error: any, request, reply) => {
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

    if (error instanceof BadRequestError) {
        request.log.warn({ url: request.url, method: request.method, err: error.message }, "Bad request");
        return reply.status(error.statusCode).send({ message: error.message });
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

    // Capturar no Sentry apenas erros não mapeados (500)
    captureError(error, {
        url: request.url,
        method: request.method,
        userId: request.user?.id,
    });

    request.log.error(
        { url: request.url, method: request.method, err: error?.message, stack: error?.stack },
        "Request error",
    );
    return reply.status(500).send({
        message: "Internal Server Error",
        error: error?.message ?? "Internal Server Error",
    });
});

export { server }
