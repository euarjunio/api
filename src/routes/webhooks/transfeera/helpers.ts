import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/prisma.ts";
import { webhookQueue } from "../../../lib/queues/webhook-queue.ts";

/**
 * Busca ou cria um Customer a partir dos dados do pagador do PIX.
 * Scoped to the merchant to prevent cross-merchant customer pollution.
 */
export async function findOrCreateCustomerFromPayer(
  payer: any,
  merchantId: string,
  request: any,
): Promise<string> {
  const doc = String(payer.document).replace(/\D/g, "");
  const name = payer.name ?? "Desconhecido";
  const docType = doc.length <= 11 ? "CPF" : "CNPJ";

  let customer = await prisma.customer.findFirst({
    where: { document: doc, merchantId },
  });

  if (customer) {
    if (customer.name !== name) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { name },
      });
    }
    request.log.info(`[CUSTOMER] Existente vinculado | id: ${customer.id} | ${name} (${doc})`);
    return customer.id;
  }

  customer = await prisma.customer.create({
    data: {
      name,
      document: doc,
      documentType: docType,
      merchantId,
    },
  });

  request.log.info(`[CUSTOMER] Novo criado | id: ${customer.id} | ${name} (${doc})`);
  return customer.id;
}

/**
 * Enfileira notificação de webhook para o merchant via BullMQ.
 */
export async function notifyMerchant(merchantId: string, event: string, payload: any, request: any) {
  try {
    const webhooks = await prisma.merchantWebhook.findMany({
      where: {
        merchantId,
        status: "ACTIVE",
      },
    });

    if (webhooks.length === 0) {
      request.log.info(`[NOTIFY] Merchant ${merchantId} não tem webhooks configurados — pulando`);
      return;
    }

    const matching = webhooks.filter(
      (wh) => wh.events.length === 0 || wh.events.includes(event),
    );

    if (matching.length === 0) {
      request.log.info(
        `[NOTIFY] Merchant ${merchantId} tem ${webhooks.length} webhook(s) mas nenhum escuta "${event}" — pulando`,
      );
      return;
    }

    await Promise.all(
      matching.map(async (webhook) => {
        const deliveryId = randomUUID();

        await webhookQueue.add(
          "deliver",
          {
            merchantId,
            webhookId: webhook.id,
            deliveryId,
            url: webhook.url,
            secret: webhook.secret,
            event,
            payload,
          },
          {
            jobId: `${event}-${deliveryId}`,
          },
        );

        request.log.info(
          `[NOTIFY] Job enfileirado | event: ${event} | webhook: ${webhook.name ?? webhook.id} | url: ${webhook.url} | deliveryId: ${deliveryId}`,
        );
      }),
    );
  } catch (err: any) {
    request.log.error(
      `[NOTIFY] Erro ao enfileirar notificação para merchant ${merchantId}: ${err?.message}`,
    );
  }
}
