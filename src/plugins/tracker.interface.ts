// ── Interface central para plugins de tracking ──────────────────────

export interface TrackingEventData {
  chargeId: string;
  txid: string;
  amount: number; // em centavos
  paidAt: string; // ISO datetime

  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    document?: string;
  };

  /** Dados de atribuição capturados na criação da cobrança */
  tracking?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    fbclid?: string;
    fbc?: string;
    fbp?: string;
    sourceUrl?: string;
    clientIp?: string;
    userAgent?: string;
  };
}

export interface TrackerPlugin {
  /** Nome identificador do plugin (ex: "utmify", "meta_pixel") */
  readonly name: string;

  /**
   * Dispara o evento de conversão/estorno para o serviço externo.
   *
   * @param credentials – Credenciais do merchant (parseadas do JSON no banco)
   * @param event       – Tipo do evento
   * @param data        – Dados da transação + tracking
   */
  sendEvent(
    credentials: Record<string, any>,
    event: "purchase" | "refund",
    data: TrackingEventData,
  ): Promise<void>;
}
