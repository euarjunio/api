import type { TrackerPlugin, TrackingEventData } from "../tracker.interface.ts";

const UTMIFY_API_URL = "https://api.utmify.com.br/api-credentials/orders";

export class UtmifyPlugin implements TrackerPlugin {
  readonly name = "utmify";

  async sendEvent(
    credentials: Record<string, any>,
    event: "purchase" | "refund",
    data: TrackingEventData,
  ): Promise<void> {
    const { apiToken } = credentials;
    if (!apiToken) throw new Error("UTMify: apiToken não configurado");

    const statusMap: Record<string, string> = {
      purchase: "paid",
      refund: "refunded",
    };

    const body: Record<string, any> = {
      orderId: data.chargeId,
      platform: "liquera",
      paymentMethod: "pix",
      amount: data.amount / 100, // UTMify espera em reais
      status: statusMap[event],
      createdAt: data.paidAt,
    };

    if (event === "purchase") body.approvedDate = data.paidAt;
    if (event === "refund") body.refundedDate = data.paidAt;

    // Customer
    if (data.customer) {
      body.customer = {
        name: data.customer.name ?? undefined,
        email: data.customer.email ?? undefined,
        phone: data.customer.phone ?? undefined,
        document: data.customer.document ?? undefined,
      };
    }

    // UTM params
    if (data.tracking) {
      body.utm_source = data.tracking.utmSource;
      body.utm_medium = data.tracking.utmMedium;
      body.utm_campaign = data.tracking.utmCampaign;
      body.utm_content = data.tracking.utmContent;
      body.utm_term = data.tracking.utmTerm;
    }

    const res = await fetch(UTMIFY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": apiToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`UTMify API error ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
