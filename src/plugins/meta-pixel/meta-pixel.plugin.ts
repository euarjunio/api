import { createHash } from "node:crypto";
import type { TrackerPlugin, TrackingEventData } from "../tracker.interface.ts";

const META_API_VERSION = "v21.0";

/** Hash SHA-256 (lowercase + trim) como o Meta exige para user_data */
function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export class MetaPixelPlugin implements TrackerPlugin {
  readonly name = "meta_pixel";

  async sendEvent(
    credentials: Record<string, any>,
    event: "purchase" | "refund",
    data: TrackingEventData,
  ): Promise<void> {
    const { pixelId, accessToken } = credentials;
    if (!pixelId || !accessToken) {
      throw new Error("Meta Pixel: pixelId e accessToken são obrigatórios");
    }

    // Meta CAPI só suporta Purchase (não tem evento nativo de refund)
    if (event !== "purchase") return;

    // ── user_data (hasheado conforme spec Meta) ─────────────────────
    const userData: Record<string, any> = {};

    if (data.customer?.email) userData.em = [sha256(data.customer.email)];
    if (data.customer?.phone) userData.ph = [sha256(data.customer.phone)];
    if (data.customer?.name) {
      const parts = data.customer.name.trim().split(/\s+/);
      userData.fn = [sha256(parts[0])];
      if (parts.length > 1) userData.ln = [sha256(parts[parts.length - 1])];
    }

    // Parâmetros de click / browser (não-hasheados)
    if (data.tracking?.fbc) userData.fbc = data.tracking.fbc;
    if (data.tracking?.fbp) userData.fbp = data.tracking.fbp;
    if (data.tracking?.clientIp) userData.client_ip_address = data.tracking.clientIp;
    if (data.tracking?.userAgent) userData.client_user_agent = data.tracking.userAgent;

    // ── Montar payload ──────────────────────────────────────────────
    const body = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(new Date(data.paidAt).getTime() / 1000),
          event_id: data.chargeId, // deduplicação browser ↔ server
          action_source: "website",
          event_source_url: data.tracking?.sourceUrl ?? undefined,
          user_data: userData,
          custom_data: {
            value: data.amount / 100,
            currency: "BRL",
            content_name: `Cobrança PIX ${data.txid}`,
            content_type: "product",
            order_id: data.chargeId,
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Meta CAPI error ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
