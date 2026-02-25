/**
 * Mapas de conversão entre formatos da Transfeera e enums do Prisma.
 * Centralizado para uso no webhook handler e no sync de infrações.
 */

export const statusMap: Record<string, string> = {
  pending: "PENDING",
  agreed: "AGREED",
  disagreed: "DISAGREED",
  canceled: "CANCELED",
};

export const analysisStatusMap: Record<string, string> = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  delayed: "DELAYED",
  canceled: "CANCELED",
};

export const situationTypeMap: Record<string, string> = {
  scam: "SCAM",
  account_takeover: "ACCOUNT_TAKEOVER",
  coercion: "COERCION",
  fraudulent_access: "FRAUDULENT_ACCESS",
  other: "OTHER",
  unknown: "UNKNOWN",
};

export const refundStatusMap: Record<string, string> = {
  pending: "REFUND_PENDING",
  closed: "REFUND_CLOSED",
  canceled: "REFUND_CANCELED",
};

export const refundAnalysisMap: Record<string, string> = {
  totally_accepted: "TOTALLY_ACCEPTED",
  partially_accepted: "PARTIALLY_ACCEPTED",
  rejected: "REFUND_REJECTED",
};

/**
 * Normalizar status de chave PIX da Transfeera (PT → EN).
 */
export function normalizePixKeyStatus(status: string | null | undefined): string {
  if (status === "REGISTRADA") return "REGISTERED";
  return status ?? "UNKNOWN";
}

/**
 * Checa se a chave PIX está ativa (suporta formatos PT e EN do status).
 */
export function isPixKeyActive(status: string | null | undefined): boolean {
  return status === "REGISTERED" || status === "REGISTRADA";
}
