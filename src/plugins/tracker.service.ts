import { prisma } from "../lib/prisma.ts";
import { trackingQueue } from "./tracker.queue.ts";
import type { TrackingEventData } from "./tracker.interface.ts";

/**
 * Busca todos os trackings ativos do merchant e enfileira eventos
 * de conversão/estorno para cada plugin configurado.
 *
 * Chamado no webhook handler (CashIn → purchase, CashInRefund → refund).
 */
export async function dispatchTrackingEvent(
  merchantId: string,
  event: "purchase" | "refund",
  data: TrackingEventData,
) {
  const trackings = await prisma.merchantTracking.findMany({
    where: { merchantId, enabled: true },
  });

  if (trackings.length === 0) return;

  await Promise.all(
    trackings.map((t) =>
      trackingQueue.add(
        "track",
        {
          pluginName: t.provider,
          credentials: t.credentials as Record<string, any>,
          event,
          data,
          merchantId,
          trackingId: t.id,
        },
        { jobId: `${t.provider}-${event}-${data.chargeId}` },
      ),
    ),
  );
}
