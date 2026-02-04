import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";

export const createRoute: FastifyPluginAsyncZod = async (app) => {
    app.post("/", {
        schema: {
            tags: ["Charge"],
            summary: "Criar cobrança",
            description: "Cria uma nova cobrança",
            body: z.object({
                value: z.number(),
                description: z.string(),
                customer: z.object({
                    name: z.string(),
                    email: z.string(),
                    phone: z.string(),
                    document: z.string(),
                }),
            }),
            response: {
                200: z.object({
                    message: z.string(),
                }),
            },
        },
    }, async (request, reply) => {

    });
}