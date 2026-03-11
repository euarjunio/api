import type {
  PaymentMethod,
  PixKeyResult,
  CreateChargeParams,
  CreateChargeResult,
  CreateTransferBatchParams,
  TransferBatchResult,
  AccountBalance,
  WebhookRegistration,
  InfractionFilters,
  InfractionListResult,
  InfractionAnalysisParams,
  InfractionBatchParams,
  MerchantAccountData,
} from "./types.ts";

/**
 * Interface abstrata para adquirentes de pagamento.
 *
 * Cada provedor (Transfeera, outro no futuro) implementa esta interface.
 * Métodos opcionais (boleto, cartão) podem ser adicionados sem quebrar
 * implementações existentes.
 */
export interface AcquirerProvider {
  /** Nome identificador do provedor (ex: "transfeera") */
  readonly name: string;

  /** Métodos de pagamento suportados */
  readonly supportedMethods: PaymentMethod[];

  // ── Auth ──────────────────────────────────────────────────────────
  getAdminToken(): Promise<string>;
  getMerchantToken(accountId: string): Promise<string>;

  // ── Accounts ─────────────────────────────────────────────────────
  createAccount(token: string, merchantData: MerchantAccountData): Promise<string>;

  // ── PIX Keys ─────────────────────────────────────────────────────
  createRandomPixKey(token: string): Promise<PixKeyResult>;
  getPixKeyById(token: string, keyId: string): Promise<PixKeyResult>;

  // ── Charges (PIX) ────────────────────────────────────────────────
  createCharge(token: string, params: CreateChargeParams): Promise<CreateChargeResult>;
  getChargeByTxid?(token: string, txid: string): Promise<{ txid: string; status: string; value: number; id?: string; payer?: any } | null>;

  // ── Transfers / Withdrawals ──────────────────────────────────────
  createTransferBatch(token: string, params: CreateTransferBatchParams): Promise<TransferBatchResult>;

  // ── Balance ──────────────────────────────────────────────────────
  getAccountBalance(token: string): Promise<AccountBalance>;

  // ── Webhooks ─────────────────────────────────────────────────────
  registerWebhook(token: string, webhookUrl: string): Promise<WebhookRegistration>;
  deleteWebhook(token: string, webhookId: string): Promise<void>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;

  // ── Infractions (MED) ────────────────────────────────────────────
  getInfractions(token: string, filters?: InfractionFilters): Promise<InfractionListResult>;
  getInfractionById(token: string, infractionId: string): Promise<any>;
  analyzeInfraction(token: string, infractionId: string, params: InfractionAnalysisParams): Promise<any>;
  analyzeInfractionsBatch(token: string, params: InfractionBatchParams): Promise<any[]>;

  // ── Future: Boleto & Card (optional) ─────────────────────────────
  createBoleto?(token: string, params: any): Promise<any>;
  createCardCharge?(token: string, params: any): Promise<any>;
}
