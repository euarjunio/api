import { createHmac } from "node:crypto";
import { env } from "../../config/env.ts";
import { AcquirerError } from "../acquirer.error.ts";
import type { AcquirerProvider } from "../acquirer.interface.ts";
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
} from "../types.ts";

const PROVIDER_NAME = "transfeera";
const USER_AGENT = "liquera (contato@liquera.com.br)";

export class TransfeeraProvider implements AcquirerProvider {
  readonly name = PROVIDER_NAME;
  readonly supportedMethods: PaymentMethod[] = ["PIX"];

  private apiUrl = env.URL_TRANSFEERA;
  private authUrl = env.URL_TRANSFEERA_AUTH;

  // ── Retry helper (para falhas transitórias de rede/DNS) ────────────
  private async fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fetch(url, options);
      } catch (err: any) {
        const isLast = attempt === retries - 1;
        const cause = err?.cause as Record<string, unknown> | undefined;
        const isNetworkError =
          err instanceof TypeError &&
          (err.message === "fetch failed" || cause?.code === "ENOTFOUND" || cause?.code === "ECONNREFUSED");
        if (isLast || !isNetworkError) throw err;
        const delay = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
        console.warn(`⚠️  [TRANSFEERA] Falha de rede na tentativa ${attempt + 1}/${retries}. Tentando novamente em ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("fetchWithRetry: não deveria chegar aqui");
  }

  // ── Error helper ───────────────────────────────────────────────────
  private async handleError(operation: string, response: Response): Promise<never> {
    let body: any;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    throw new AcquirerError({
      provider: PROVIDER_NAME,
      operation,
      httpStatus: response.status,
      body,
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────

  async getAdminToken(): Promise<string> {
    const response = await this.fetchWithRetry(`${this.authUrl}/authorization`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: env.TRANSFEERA_CLIENT_ID,
        client_secret: env.TRANSFEERA_CLIENT_SECRET,
      }),
    });

    if (!response.ok) await this.handleError("auth", response);

    const data: any = await response.json();
    return data.access_token;
  }

  async getMerchantToken(accountId: string): Promise<string> {
    const response = await this.fetchWithRetry(`${this.authUrl}/authorization`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: env.TRANSFEERA_CLIENT_ID,
        client_secret: env.TRANSFEERA_CLIENT_SECRET,
        scope: `account_id:${accountId}`,
      }),
    });

    if (!response.ok) await this.handleError("auth", response);

    const data: any = await response.json();
    return data.access_token;
  }

  // ── Accounts ────────────────────────────────────────────────────────

  async createAccount(token: string, merchantData: MerchantAccountData): Promise<string> {
    const response = await fetch(`${this.apiUrl}/accounts`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customer_id: env.TRANSFEERA_CUSTOMER_ID,
        tax_id: merchantData.document,
        external_id: merchantData.id,
      }),
    });

    if (!response.ok) await this.handleError("createAccount", response);

    const data: any = await response.json();
    return data.id;
  }

  // ── PIX Keys ────────────────────────────────────────────────────────

  async createRandomPixKey(token: string): Promise<PixKeyResult> {
    const response = await fetch(`${this.apiUrl}/pix/key`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) await this.handleError("createPixKey", response);

    return await response.json() as PixKeyResult;
  }

  async getPixKeyById(token: string, keyId: string): Promise<PixKeyResult> {
    const response = await fetch(`${this.apiUrl}/pix/key/${keyId}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) await this.handleError("getPixKey", response);

    return await response.json() as PixKeyResult;
  }

  // ── Charges ─────────────────────────────────────────────────────────

  async createCharge(token: string, params: CreateChargeParams): Promise<CreateChargeResult> {
    const body: any = {
      pix_key: params.pixKey,
      original_value: params.amount / 100,
      payer_question: params.description,
      expiration: params.expiresIn ?? 86400,
      reject_unknown_payer: false,
    };

    if (params.payer) {
      body.payer = {
        name: params.payer.name,
        document: params.payer.document,
      };
    }

    if (params.splitPayment && params.splitPayment.amount > 0) {
      const today = new Date().toISOString().split("T")[0];
      body.split_payment = [
        {
          mode: params.splitPayment.mode,
          amount: params.splitPayment.mode === "FIXADO"
            ? params.splitPayment.amount / 100
            : params.splitPayment.amount,
          destination_bank_account: {
            pix_key_type: env.PLATFORM_PIX_KEY_TYPE,
            pix_key: env.PLATFORM_PIX_KEY,
          },
          payment_date: today,
        },
      ];
    }

    const response = await fetch(`${this.apiUrl}/pix/qrcode/collection/immediate`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) await this.handleError("createCharge", response);

    const data: any = await response.json();
    return {
      id: data.id,
      txid: data.txid,
      emvPayload: data?.emv_payload ?? data?.emv ?? data?.emvPayload ?? null,
      imageBase64: data?.image_base64 ?? null,
      status: data.status,
    };
  }

  // ── Transfers / Withdrawals ─────────────────────────────────────────

  async createTransferBatch(token: string, params: CreateTransferBatchParams): Promise<TransferBatchResult> {
    const body = {
      name: params.name,
      type: "TRANSFERENCIA",
      transfers: params.transfers.map((t) => ({
        value: t.value,
        integration_id: t.integrationId,
        idempotency_key: t.idempotencyKey,
        pix_description: t.pixDescription ?? undefined,
        destination_bank_account: {
          pix_key_type: t.destination.pixKeyType,
          pix_key: t.destination.pixKey,
        },
      })),
      auto_close: params.autoClose ?? true,
    };

    const response = await fetch(`${this.apiUrl}/batch`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) await this.handleError("createTransferBatch", response);

    const data: any = await response.json();
    return {
      batchId: String(data.id),
      transfers: (data.transfers ?? []).map((t: any) => ({
        id: String(t.id),
        status: t.status,
      })),
    };
  }

  // ── Balance ─────────────────────────────────────────────────────────

  async getAccountBalance(token: string): Promise<AccountBalance> {
    const response = await fetch(`${this.apiUrl}/statement/balance`, {
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) await this.handleError("getAccountBalance", response);

    const data: any = await response.json();
    return {
      balance: Math.round((data.value ?? 0) * 100),
      blockedBalance: Math.round((data.waiting_value ?? 0) * 100),
    };
  }

  // ── Webhooks ────────────────────────────────────────────────────────

  async registerWebhook(token: string, webhookUrl: string): Promise<WebhookRegistration> {
    const response = await fetch(`${this.apiUrl}/webhook`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: webhookUrl,
        object_types: [
          "Transfer", "TransferRefund", "Account", "Infraction",
          "PixKey", "Payin", "PayinCardReceivable", "CashIn",
          "CashInRefund", "ChargeReceivable", "PaymentLink",
          "AutomaticPixAuthorization", "AutomaticPixAuthorizationCancellation",
          "AutomaticPixPaymentIntent", "AutomaticPixPaymentIntentCancellation",
        ],
      }),
    });

    if (!response.ok) await this.handleError("registerWebhook", response);

    const data: any = await response.json();
    return {
      id: data.id,
      signatureSecret: data.signature_secret,
    };
  }

  async deleteWebhook(token: string, webhookId: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/webhook/${webhookId}`, {
      method: "DELETE",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) await this.handleError("deleteWebhook", response);
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return expectedSignature === signature;
  }

  // ── Infractions (MED) ──────────────────────────────────────────────

  async getInfractions(token: string, filters?: InfractionFilters): Promise<InfractionListResult> {
    const params = new URLSearchParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    }

    const qs = params.toString();
    const url = `${this.apiUrl}/med/infractions${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) await this.handleError("getInfractions", response);

    return await response.json() as InfractionListResult;
  }

  async getInfractionById(token: string, infractionId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/med/infractions/${infractionId}`, {
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) await this.handleError("getInfractionById", response);

    return await response.json();
  }

  async analyzeInfraction(
    token: string,
    infractionId: string,
    params: InfractionAnalysisParams,
  ): Promise<any> {
    const formData = new FormData();
    formData.append("analysis", params.analysis);
    formData.append("analysis_description", params.analysis_description);

    const response = await fetch(`${this.apiUrl}/med/infractions/${infractionId}/analysis`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) await this.handleError("analyzeInfraction", response);

    return await response.json();
  }

  async analyzeInfractionsBatch(token: string, params: InfractionBatchParams): Promise<any[]> {
    const response = await fetch(`${this.apiUrl}/med/infractions/analysis`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) await this.handleError("analyzeInfractionsBatch", response);

    return await response.json() as any[];
  }
}
