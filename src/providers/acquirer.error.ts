/**
 * Erro estruturado para falhas com provedores de pagamento (adquirentes).
 * Substitui TransfeeraError — agnóstico ao provedor.
 */
export class AcquirerError extends Error {
  public statusCode: number;
  public acquirerStatus: number;
  public acquirerBody: any;
  public operation: string;
  public provider: string;

  constructor(params: {
    provider: string;
    operation: string;
    httpStatus: number;
    body: any;
  }) {
    const friendly = AcquirerError.toFriendlyMessage(params.provider, params.operation, params.httpStatus, params.body);
    super(friendly);
    this.name = "AcquirerError";
    this.provider = params.provider;
    this.operation = params.operation;
    this.acquirerStatus = params.httpStatus;
    this.acquirerBody = params.body;
    this.statusCode = AcquirerError.mapStatusCode(params.httpStatus);
  }

  /**
   * Mapeia HTTP status do provedor → HTTP status da nossa API.
   */
  private static mapStatusCode(providerStatus: number): number {
    if (providerStatus === 401 || providerStatus === 403) return 502;
    if (providerStatus === 404) return 422;
    if (providerStatus === 409) return 409;
    if (providerStatus === 422) return 422;
    if (providerStatus === 429) return 503;
    if (providerStatus >= 500) return 502;
    return 422;
  }

  /**
   * Gera mensagem amigável baseada no provedor, operação e body de erro.
   */
  private static toFriendlyMessage(provider: string, operation: string, status: number, body: any): string {
    const raw =
      body?.message ??
      body?.error?.message ??
      body?.error_description ??
      body?.error ??
      (typeof body === "string" ? body : null);

    const MESSAGES: Record<string, Record<number, string>> = {
      auth: {
        401: `Credenciais do provedor ${provider} inválidas. Verifique as configurações.`,
        403: `Acesso negado pelo provedor ${provider}. Verifique suas permissões.`,
      },
      createAccount: {
        409: `Já existe uma conta no provedor ${provider} para esse documento.`,
        422: `Dados inválidos para criar conta no provedor ${provider}.`,
      },
      createCharge: {
        409: `Já existe uma cobrança com esse txid no provedor ${provider}.`,
        422: `Erro ao criar cobrança: ${raw ?? "dados inválidos"}`,
        429: `Provedor ${provider} com limite de requisições. Tente novamente em alguns minutos.`,
      },
      createPixKey: {
        409: "Já existe uma chave PIX para essa conta.",
        422: `Erro ao criar chave PIX: ${raw ?? "dados inválidos"}`,
      },
      createTransferBatch: {
        400: `Erro ao criar lote de transferência: ${raw ?? "dados inválidos"}`,
        422: `Erro ao criar lote de transferência: ${raw ?? "dados inválidos"}`,
        429: `Provedor ${provider} com limite de requisições. Tente novamente em alguns minutos.`,
      },
      registerWebhook: {
        409: `Já existe um webhook registrado no provedor ${provider}.`,
      },
    };

    const mapped = MESSAGES[operation]?.[status];
    if (mapped) return mapped;

    if (status === 401 || status === 403) return `Falha de autenticação com o provedor ${provider}. Contate o suporte.`;
    if (status === 429) return `Provedor ${provider} temporariamente indisponível (rate limit). Tente novamente em instantes.`;
    if (status >= 500) return `O provedor ${provider} está com instabilidade. Tente novamente mais tarde.`;

    return raw ? `Erro ${provider}: ${raw}` : `Erro na operação '${operation}' (HTTP ${status})`;
  }
}
