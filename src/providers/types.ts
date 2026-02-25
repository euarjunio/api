// ── Payment Methods ──────────────────────────────────────────────────
export type PaymentMethod = "PIX" | "BOLETO" | "CARD";

// ── PIX Keys ─────────────────────────────────────────────────────────
export interface PixKeyResult {
  id: string;
  key: string | null;
  type?: string | null;
  status?: string | null;
}

// ── Charges ──────────────────────────────────────────────────────────
export interface CreateChargeParams {
  pixKey: string;
  amount: number;          // Centavos
  description: string;
  paymentMethod?: PaymentMethod;
  payer?: { name: string; document: string };
  expiresIn?: number;      // Segundos
  splitPayment?: {
    mode: "PERCENTUAL" | "FIXADO";
    amount: number;
  };
}

export interface CreateChargeResult {
  id: string;
  txid: string;
  emvPayload: string | null;
  imageBase64?: string | null;
  status: string;
}

// ── Transfers / Withdrawals ──────────────────────────────────────────
export interface CreateTransferBatchParams {
  name: string;
  transfers: Array<{
    value: number;            // BRL (não centavos)
    integrationId: string;
    idempotencyKey: string;
    pixDescription?: string;
    destination: {
      pixKeyType: string;
      pixKey: string;
    };
  }>;
  autoClose?: boolean;
}

export interface TransferBatchResult {
  batchId: string;
  transfers: Array<{ id: string; status: string }>;
}

// ── Balance ──────────────────────────────────────────────────────────
export interface AccountBalance {
  balance: number;          // Centavos
  blockedBalance: number;   // Centavos
}

// ── Webhooks ─────────────────────────────────────────────────────────
export interface WebhookRegistration {
  id: string;
  signatureSecret: string;
}

// ── Infractions ──────────────────────────────────────────────────────
export interface InfractionFilters {
  infraction_date__gte?: string;
  infraction_date__lte?: string;
  transaction_id?: string;
  analysis_status__in?: string;
  payer_tax_id?: string;
  page_cursor?: string;
  page_size?: number;
}

export interface InfractionListResult {
  items: any[];
  meta: { next?: string; previous?: string };
}

export interface InfractionAnalysisParams {
  analysis: "accepted" | "rejected";
  analysis_description: string;
}

export interface InfractionBatchParams {
  infraction_ids: string[];
  analysis: "accepted";
}

// ── Accounts ─────────────────────────────────────────────────────────
export interface MerchantAccountData {
  id: string;
  document: string;
}
