import { env } from "./config/env.ts";

import fastify from "fastify";
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

const app = fastify().withTypeProvider<ZodTypeProvider>();

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
  },
  transform: jsonSchemaTransform,
});

app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

app.register(registerAuth, { prefix: "/v1/auth/" });
app.register(loginAuth, { prefix: "/v1/auth/" });

app.register(merchantCreate, { prefix: "/v1/" });

app.setErrorHandler((error, request, reply) => {
  console.error(error);

  return reply.status(500).send({ message: "Internal Server Error" });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
  console.log(`HTTP server running on port ${env.PORT}`);
});
