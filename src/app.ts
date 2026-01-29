import { env } from "./config/env.ts";

import fastify from "fastify";
import { fastifyCors } from "@fastify/cors";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import {
    hasZodFastifySchemaValidationErrors,
    jsonSchemaTransform,
    serializerCompiler,
    validatorCompiler,
} from "fastify-type-provider-zod";
import fastifyJwt from "@fastify/jwt";
import { z } from "zod/v4";

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { registerAuth } from "./routes/auth/register.ts";
import { loginAuth } from "./routes/auth/login.ts";

import { merchantCreate } from "./routes/merchant/create.ts";
import { merchantList } from "./routes/merchant/list.ts";
import { merchantUpdate } from "./routes/merchant/update.ts";

import { apiKeysCreate } from "./routes/api-keys/create.ts";
import { apiKeysList } from "./routes/api-keys/list.ts";
import { apiKeysDelete } from "./routes/api-keys/delete.ts";
import { BadRequestError } from "./routes/errors/bad-request-error.ts";

const server = fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
                colorize: true,
                singleLine: true,
                messageFormat: '{msg}',
            },
        },
    },
}).withTypeProvider<ZodTypeProvider>();

server.register(fastifyCors, {
    origin: true,
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifyJwt, {
    secret: env.JWT_SECRET,
});

if (env.NODE_ENV === "development") {
    server.register(fastifySwagger, {
        openapi: {
            info: {
                title: "Gateway API",
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

server.get(
    "/health",
    {
        schema: {
            tags: ["Health"],
            summary: "Health check",
            description: "Verifica o status da API",
            response: {
                200: z.object({
                    status: z.string(),
                    timestamp: z.string(),
                }),
            },
        },
    },
    async (request, reply) => {
        return reply.status(200).send({
            status: "ok",
            timestamp: new Date().toISOString(),
        });
    },
);

server.get(
    "/",
    {
        schema: {
            tags: ["Root"],
            summary: "Root endpoint",
            description: "Endpoint raiz da API",
            response: {
                200: z.object({
                    message: z.string(),
                    version: z.string(),
                }),
            },
        },
    },
    async (request, reply) => {
        return reply.status(200).send({
            message: "Gateway API",
            version: "1.0.0",
        });
    },
);

server.register(registerAuth, { prefix: "/v1/auth" });
server.register(loginAuth, { prefix: "/v1/auth" });

server.register(merchantCreate, { prefix: "/v1" });
server.register(merchantList, { prefix: "/v1" });
server.register(merchantUpdate, { prefix: "/v1" });

server.register(apiKeysCreate, { prefix: "/v1" });
server.register(apiKeysList, { prefix: "/v1" });
server.register(apiKeysDelete, { prefix: "/v1" });

server.setErrorHandler((error: any, request, reply) => {
    request.log.error({ error, url: request.url, method: request.method }, 'Request error')

    if (hasZodFastifySchemaValidationErrors(error)) {
        return reply.code(400).send({
            error: 'Response Validation Error',
            message: "Request doesn't match the schema",
            statusCode: 400,
            details: {
                issues: error.validation,
                method: request.method,
                url: request.url,
            },
        });
    }

    if (error instanceof BadRequestError) {
        return reply.status(error.statusCode).send({ message: error.message });
    }

    return reply.status(500).send({ message: "Internal Server Error" });
});

export { server }