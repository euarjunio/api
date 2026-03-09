import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Prisma } from "../../lib/generated/prisma/client.ts";

import { checkUserRequest } from "../../utils/check-user-request.ts";
import { authenticate } from "../hooks/authenticate.ts";
import { invalidatePattern } from "../../lib/cache.ts";
import { logAction, getRequestContext } from "../../lib/audit.ts";
import {
  validateMerchantForCharge,
  checkIdempotency,
  resolveCustomer,
  createChargeOnAcquirer,
} from "../../services/charge.service.ts";

export const createChargeRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate).post("/", {
    schema: {
      tags: ["Charges"],
      summary: "Criar cobrança PIX",
      description: "Cria uma cobrança imediata com QR Code PIX e split de taxa. O pagador (customer) é opcional.",
      body: z.object({
        amount: z.number().int().min(1, "Valor mínimo é 1 centavo").max(100_000_000, "Valor máximo é R$ 1.000.000,00"),
        description: z.string().min(1).max(255),
        expiresIn: z.number().int().min(60).max(604800).optional().default(86400),
        customer: z.object({
          name: z.string().min(2),
          email: z.email(),
          phone: z.string().min(10).max(15),
          document: z.string().min(11).max(18),
        }).optional(),
        tracking: z.object({
          utmSource: z.string().max(255).optional(),
          utmMedium: z.string().max(255).optional(),
          utmCampaign: z.string().max(255).optional(),
          utmContent: z.string().max(255).optional(),
          utmTerm: z.string().max(255).optional(),
          fbclid: z.string().max(500).optional(),
          fbc: z.string().max(500).optional(),
          fbp: z.string().max(500).optional(),
          sourceUrl: z.string().max(2048).optional(),
          clientIp: z.string().max(45).optional(),
          userAgent: z.string().max(500).optional(),
        }).optional(),
      }),
      headers: z.object({
        "x-idempotency-key": z.string().max(64).optional(),
      }).passthrough(),
      response: {
        200: z.object({
          charge: z.object({
            id: z.string(),
            txid: z.string().nullable(),
            qrCode: z.string().nullable(),
            amount: z.number(),
            status: z.string(),
            expiresIn: z.number(),
            customer: z.object({
              id: z.string(),
              name: z.string(),
              document: z.string(),
            }).nullable(),
            createdAt: z.string().datetime(),
          }),
          idempotent: z.boolean(),
        }),
        201: z.object({
          charge: z.object({
            id: z.string(),
            txid: z.string().nullable(),
            qrCode: z.string().nullable(),
            imageBase64: z.string().nullable(),
            amount: z.number(),
            status: z.string(),
            expiresIn: z.number(),
            customer: z.object({
              id: z.string(),
              name: z.string(),
              document: z.string(),
            }).nullable(),
          }),
        }),
        400: z.object({ message: z.string() }),
        403: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
        409: z.object({ message: z.string() }),
        422: z.object({ message: z.string() }),
        500: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);
    const { amount, description, expiresIn, customer: customerData, tracking } = request.body;
    const idempotencyKey = (request.headers["x-idempotency-key"] as string | undefined) || null;

    const validation = await validateMerchantForCharge(userId, amount);
    if (!validation.ok) {
      return reply.status(validation.status).send({ message: validation.message });
    }
    const { merchant } = validation;

    const existing = await checkIdempotency(merchant.id, idempotencyKey);
    if (existing) {
      request.log.info(`[CHARGE] Idempotência | key: ${idempotencyKey} | chargeId: ${existing.id}`);
      return reply.status(200).send({
        charge: {
          id: existing.id,
          txid: existing.txid,
          qrCode: existing.qrCode,
          amount: existing.amount,
          status: existing.status,
          expiresIn: existing.expiresIn,
          customer: existing.customer ?? null,
          createdAt: existing.createdAt.toISOString(),
        },
        idempotent: true,
      });
    }

    let customer = null;
    let payer: { name: string; document: string } | undefined;

    if (customerData) {
      const resolved = await resolveCustomer(merchant.id, customerData);
      if (!resolved.ok) {
        return reply.status(422).send({ message: resolved.message });
      }
      customer = resolved.customer;
      payer = resolved.payer;
    }

    const result = await createChargeOnAcquirer({
      merchant,
      amount,
      description,
      expiresIn,
      idempotencyKey,
      customer,
      payer,
      tracking: tracking as Prisma.InputJsonObject | undefined,
    });

    request.log.info({ chargeId: result.charge.id, txid: result.charge.txid, merchantId: merchant.id }, "Charge created");
    logAction({ action: "CHARGE_CREATED", actor: request.user.id, target: result.charge.id, metadata: { merchantId: merchant.id, amount, txid: result.charge.txid }, ...getRequestContext(request) });
    await invalidatePattern(`cache:charges:${merchant.id}:*`);

    return reply.status(201).send({
      charge: { ...result.charge, customer },
    });
  });
};
