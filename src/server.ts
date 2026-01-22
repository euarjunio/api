import { env } from "./config/env.ts";

import fastify from "fastify";
import { fastifyCors } from "@fastify/cors";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import fastifyJwt from "@fastify/jwt";

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

const app = fastify().withTypeProvider<ZodTypeProvider>();

app.register(fastifyCors, {
  origin: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});

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

env.NODE_ENV === "development" && app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

app.register(registerAuth, { prefix: "/v1/auth" });
app.register(loginAuth, { prefix: "/v1/auth" });

app.register(merchantCreate, { prefix: "/v1" });
app.register(merchantList, { prefix: "/v1" });
app.register(merchantUpdate, { prefix: "/v1" });

app.register(apiKeysCreate, { prefix: "/v1" });
app.register(apiKeysList, { prefix: "/v1" });
app.register(apiKeysDelete, { prefix: "/v1" });

app.setErrorHandler((error, request, reply) => {
  console.error(error);

  if (error instanceof BadRequestError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  return reply.status(500).send({ message: "Internal Server Error" });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
  console.log(`HTTP server running on port ${env.PORT}`);
});
