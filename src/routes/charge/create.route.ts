import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { verifyJwt } from "../hooks/verify-jwt.ts";
import { env } from "../../config/env.ts";

const loginTransfeera = async () => {
    const response = await fetch('https://login-api-sandbox.transfeera.com/authorization', {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: env.TRANSFEERA_CLIENT_ID,
            client_secret: env.TRANSFEERA_CLIENT_SECRET,
        }),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    if (!response.ok) {
        throw new Error("Failed to login to Transfeera");
    }

    return response.json();
}

const createChargeTransfeera = async (data: any, token: string) => {
    const response = await fetch(`${process.env.URL_TRANSFEERA}/charges`, {
        method: "POST",
        body: JSON.stringify({
            "payment_methods": ["pix"],
            "payment_method_details": {
                "pix": { "pix_key": "key@email.com" }
            },
            "payer": {
                "name": data.name,
                "trade_name": data.name,
                "tax_id": data.document,
            },
            /*"split_payment": [
              {
                "mode": "fixed",
                "receiver": { "pix_key": "minhachave@gmail.com" },
                "amount": 1000,
                "split_days_after_settled": 1
              }
            ],
            */
            "amount": data.amount,
            "due_date": data.due_date,
            "expiration_date": data.expiration_date,
            "description": data.description,
            "external_id": data.external_id
        }),
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error("Failed to create charge in Transfeera");
    }
}

export const createRoute: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", verifyJwt).post("/", {
        schema: {
            tags: ["Charge"],
            summary: "Criar cobrança",
            description: "Cria uma nova cobrança",
            body: z.object({
                amount: z.number(),
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
                404: z.object({
                    message: z.string(),
                }),
            },
        },
    }, async (request, reply) => {
        const { id } = await checkUserRequest(request);

        const { amount, description, customer: { name, email, phone, document } } = request.body;

        const merchant = await prisma.merchant.findUnique({
            where: { userId: id },
        });

        if (!merchant) {
            return reply.status(404).send({ message: "Merchant not found" });
        }

        const customer = await prisma.customer.findUnique({
            where: { document },
        }) as any

        if (!customer) {
            customer = await prisma.customer.create({
                data: {
                    name,
                    email,
                    phone,
                    document,
                    documentType: document.length === 11 ? "CPF" : "CNPJ",
                },
            })
        }

        const token = await loginTransfeera();
        console.log(token);

        const charge = await createChargeTransfeera({
            amount,
            description,
            customerId: customer.id,
        }, token.access_token);


        console.log(charge);

        /* const charge = await prisma.charges.create({
             data: {
                 amount,
                 description,
                 customerId: customer.id,
                 merchantId: merchant.id,
                 qrCode: "",
                 expiresIn: 0,
             },
         });*/

        return reply.status(200).send({ message: "Charge created successfully" });
    });
}