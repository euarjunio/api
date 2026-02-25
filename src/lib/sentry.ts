import * as Sentry from "@sentry/node";
import { env } from "../config/env.ts";

// DSN precisa começar com "https://" para ser válido
const isEnabled = !!env.SENTRY_DSN && env.SENTRY_DSN.startsWith("https://");

if (isEnabled) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1.0,
    beforeSend(event) {
      // Não enviar erros de validação (400) para o Sentry
      if (event.tags?.["http.status_code"] === "400") return null;
      if (event.tags?.["http.status_code"] === "401") return null;
      if (event.tags?.["http.status_code"] === "429") return null;
      return event;
    },
  });
  console.log("🔍 [SENTRY] Initialized");
} else {
  console.log("🔍 [SENTRY] Disabled (no SENTRY_DSN configured)");
}

/**
 * Captura um erro no Sentry (se habilitado).
 * Pode ser chamado de qualquer lugar do código.
 */
export function captureError(error: Error | unknown, context?: Record<string, any>) {
  if (!isEnabled) return;

  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export { Sentry, isEnabled };
