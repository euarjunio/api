import { FastifyInstance } from "fastify";
import { z } from "zod";

export async function systemRoutes(server: FastifyInstance) {
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
}