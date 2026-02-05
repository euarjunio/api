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

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { BadRequestError } from "./routes/errors/bad-request-error.ts";

import { systemRoutes } from "./routes/system/index.ts";
import { authRoutes } from "./routes/auth/index.ts";
import { merchantRoutes } from "./routes/merchant/index.ts";
import { apiKeyRoutes } from "./routes/api-key/index.ts";
import { chargeRoutes } from "./routes/charge/index.ts";

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

server.register(systemRoutes);
server.register(authRoutes, { prefix: "/v1/auth" });
server.register(merchantRoutes, { prefix: "/v1/merchant" });
server.register(apiKeyRoutes, { prefix: "/v1/api-key" });
server.register(chargeRoutes, { prefix: "/v1/charge" });

server.setErrorHandler((error: any, request, reply) => {
    request.log.error({ error, url: request.url, method: request.method }, 'Request error')

    console.error(error);

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