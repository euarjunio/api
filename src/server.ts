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

const app = fastify(/* {
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
} */).withTypeProvider<ZodTypeProvider>();

app.register(fastifyCors, {
  origin: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});

if (env.NODE_ENV === "development") {
  app.register(fastifySwagger, {
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

  app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });
}

app.get(
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

app.get(
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

app.register(registerAuth, { prefix: "/v1/auth" });
app.register(loginAuth, { prefix: "/v1/auth" });

app.register(merchantCreate, { prefix: "/v1" });
app.register(merchantList, { prefix: "/v1" });
app.register(merchantUpdate, { prefix: "/v1" });

app.register(apiKeysCreate, { prefix: "/v1" });
app.register(apiKeysList, { prefix: "/v1" });
app.register(apiKeysDelete, { prefix: "/v1" });

app.setErrorHandler((error: any, request, reply) => {
  console.error(error)

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

app.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
  console.log(`HTTP server running on port ${env.PORT}`);
});
