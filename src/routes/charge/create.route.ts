import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { randomUUID } from 'node:crypto';
import axios from 'axios';

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

const createCharge = async (customer: any, amount: number, description: string, token: string) => {
    try {
        const response = await axios({
            method: 'post',
            url: 'https://api-sandbox.transfeera.com/charges',
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json'
            },
            data: {
                "payment_methods": [
                    "pix"
                ],
                "payment_method_details": {
                    "pix": {
                        "pix_key": "4942dd7d-3859-41e4-8d94-5772f211e2af"
                    }
                },
                "payer": {
                    "name": customer.name,
                    "trade_name": customer.name.split(' ')[1],
                    "tax_id": customer.document
                },
                "amount": amount,
                "due_date": new Date().toISOString().split('T')[0],
                "expiration_date": new Date().toISOString().split('T')[0],
                "description": description,
                "external_id": randomUUID()
            }
        });
        console.log(response);
    } catch (error) {
        console.error((error as any).response.data);
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

        let customer = await prisma.customer.findFirst({
            where: {
                OR: [
                    { document },
                    { email }
                ]
            },
        })

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

        const charge = await createCharge(customer, amount, description, (token as any).access_token)
        

        return reply.status(200).send({ message: "Charge created successfully" });
    });
}