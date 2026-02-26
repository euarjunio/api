import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../hooks/authenticate.ts";
import { getProviderForMerchant } from "../../providers/acquirer.registry.ts";
import { getDocumentType, normalizeDocument } from "../../utils/br-document.ts";
import { isPixKeyActive } from "../../providers/transfeera/transfeera.maps.ts";
import { invalidatePattern } from "../../lib/cache.ts";

export const createChargeRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", authenticate).post("/", {
    schema: {
      tags: ["Charges"],
      summary: "Criar cobrança PIX",
      description: "Cria uma cobrança imediata com QR Code PIX e split de taxa. O pagador (customer) é opcional.",
      body: z.object({
        amount: z.number().int().min(1, "Valor mínimo é 1 centavo"),
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

    // 1. Buscar merchant
    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      return reply.status(404).send({ message: "Merchant não encontrado" });
    }

    // 1.5 Verificar idempotência
    if (idempotencyKey) {
      const existingCharge = await prisma.charges.findUnique({
        where: {
          merchantId_idempotencyKey: {
            merchantId: merchant.id,
            idempotencyKey,
          },
        },
        include: {
          customer: { select: { id: true, name: true, document: true } },
        },
      });

      if (existingCharge) {
        request.log.info(
          `♻️  [CHARGE] Idempotência | Retornando cobrança existente | key: ${idempotencyKey} | chargeId: ${existingCharge.id}`
        );
        return reply.status(200).send({
          charge: {
            id: existingCharge.id,
            txid: existingCharge.txid,
            qrCode: existingCharge.qrCode,
            amount: existingCharge.amount,
            status: existingCharge.status,
            expiresIn: existingCharge.expiresIn,
            customer: existingCharge.customer ?? null,
            createdAt: existingCharge.createdAt.toISOString(),
          },
          idempotent: true,
        });
      }
    }

    // 2. Verificar KYC aprovado
    if (merchant.kycStatus !== "APPROVED") {
      return reply.status(403).send({
        message: "Sua conta ainda não foi aprovada pelo compliance. Envie seus documentos.",
      });
    }

    // 3. Verificar conta do adquirente configurada
    if (!merchant.acquirerAccountId) {
      return reply.status(403).send({
        message: "Conta do adquirente não configurada. Aguarde a ativação pelo administrador.",
      });
    }

    // 4. Verificar se tem chave PIX cadastrada e ativa
    if (!merchant.pixKey || !merchant.pixKeyId) {
      return reply.status(403).send({
        message: "Chave PIX não cadastrada. Cadastre uma chave PIX antes de criar cobranças.",
      });
    }

    if (!isPixKeyActive(merchant.pixKeyStatus)) {
      return reply.status(403).send({
        message: "Sua chave PIX ainda não está ativa. Aguarde a ativação para criar cobranças.",
      });
    }

    // 5. Buscar ou criar customer (opcional)
    let customer: { id: string; name: string; document: string } | null = null;
    let payer: { name: string; document: string } | undefined;

    if (customerData) {
      const customerDocument = normalizeDocument(customerData.document);
      const customerDocumentType = getDocumentType(customerDocument);

      if (!customerDocumentType) {
        return reply.status(422).send({
          message: "Documento do pagador não é um CPF nem CNPJ válido",
        });
      }

      let dbCustomer = await prisma.customer.findFirst({
        where: {
          OR: [
            { document: customerDocument },
            { email: customerData.email },
          ],
        },
      });

      if (!dbCustomer) {
        dbCustomer = await prisma.customer.create({
          data: {
            name: customerData.name,
            email: customerData.email,
            phone: customerData.phone,
            document: customerDocument,
            documentType: customerDocumentType,
          },
        });
      }

      customer = { id: dbCustomer.id, name: dbCustomer.name, document: dbCustomer.document };
      payer = { name: dbCustomer.name, document: dbCustomer.document };
    }

    // 6. Obter provider e gerar token scoped
    const provider = await getProviderForMerchant(merchant.id);
    const merchantToken = await provider.getMerchantToken(merchant.acquirerAccountId);

    // 7. Criar cobrança no adquirente
    const chargeResult = await provider.createCharge(merchantToken, {
      pixKey: merchant.pixKey,
      amount,
      description,
      expiresIn,
      payer,
      splitPayment: merchant.feeAmount > 0
        ? { mode: merchant.feeMode, amount: merchant.feeAmount }
        : undefined,
    });

    // 8. Salvar cobrança no banco
    const charge = await prisma.charges.create({
      data: {
        amount,
        description,
        status: "PENDING",
        acquirer: merchant.acquirer,
        paymentMethod: "PIX",
        txid: chargeResult.txid,
        qrCode: chargeResult.emvPayload,
        expiresIn,
        idempotencyKey,
        merchantId: merchant.id,
        customerId: customer?.id ?? null,
        tracking: tracking ?? undefined,
      },
    });

    request.log.info({ chargeId: charge.id, txid: charge.txid, merchantId: merchant.id }, "Charge created");

    // Invalidar cache de listagem de charges
    await invalidatePattern(`cache:charges:${merchant.id}:*`);

    return reply.status(201).send({
      charge: {
        id: charge.id,
        txid: charge.txid,
        qrCode: charge.qrCode,
        imageBase64: chargeResult.imageBase64 ?? null,
        amount: charge.amount,
        status: charge.status,
        expiresIn: charge.expiresIn,
        customer,
      },
    });
  });
};
