import { Redis } from "ioredis";
import { prisma } from "./prisma.ts";
import { env } from "../config/env.ts";
import type { NotificationType } from "./generated/prisma/enums.ts";

// Redis publisher dedicado (não usar o mesmo do BullMQ para pub/sub)
const publisher = new Redis(env.REDIS_URL);

/** Fecha a conexão do publisher no graceful shutdown */
export async function closeNotificationsPublisher(): Promise<void> {
  await publisher.quit();
}

export interface CreateNotificationInput {
  merchantId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

/**
 * Cria notificação no banco + publica via Redis Pub/Sub para SSE em tempo real.
 */
export async function pushNotification(input: CreateNotificationInput) {
  // 1. Persistir no banco
  const notification = await prisma.notification.create({
    data: {
      merchantId: input.merchantId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data ?? undefined,
    },
  });

  // 2. Publicar no Redis para SSE listeners
  const channel = `notify:${input.merchantId}`;
  await publisher.publish(
    channel,
    JSON.stringify({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: notification.createdAt.toISOString(),
    }),
  );

  return notification;
}

/**
 * Helpers pré-formatados para cada tipo de evento
 */
export const notifications = {
  chargePaid(merchantId: string, data: { chargeId: string; amount: number; txid: string; payerName?: string }) {
    const value = (data.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return pushNotification({
      merchantId,
      type: "CHARGE_PAID",
      title: "Nova venda aprovada! 🎉",
      message: `Pagamento de ${value} confirmado${data.payerName ? ` por ${data.payerName}` : ""}.`,
      data,
    });
  },

  chargeRefunded(merchantId: string, data: { chargeId: string; amount: number; txid?: string }) {
    const value = (data.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return pushNotification({
      merchantId,
      type: "CHARGE_REFUNDED",
      title: "Estorno processado",
      message: `Estorno de ${value} realizado.`,
      data,
    });
  },

  withdrawCompleted(merchantId: string, data: { withdrawId: string; amount: number }) {
    const value = (data.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return pushNotification({
      merchantId,
      type: "WITHDRAW_COMPLETED",
      title: "Saque concluído ✅",
      message: `Saque de ${value} transferido com sucesso.`,
      data,
    });
  },

  withdrawFailed(merchantId: string, data: { withdrawId: string; amount: number; reason?: string }) {
    const value = (data.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return pushNotification({
      merchantId,
      type: "WITHDRAW_FAILED",
      title: "Saque falhou ❌",
      message: `Saque de ${value} falhou${data.reason ? `: ${data.reason}` : ""}. O saldo foi devolvido.`,
      data,
    });
  },

  infractionReceived(merchantId: string, data: { infractionId: string; amount: number; situationType: string }) {
    const value = (data.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return pushNotification({
      merchantId,
      type: "INFRACTION_RECEIVED",
      title: "Nova infração recebida ⚠️",
      message: `Infração MED de ${value} recebida. Requer sua análise.`,
      data,
    });
  },

  pixKeyUpdated(merchantId: string, data: { status: string }) {
    return pushNotification({
      merchantId,
      type: "PIX_KEY_UPDATED",
      title: "Chave PIX atualizada",
      message: `Status da sua chave PIX: ${data.status}`,
      data,
    });
  },
};
