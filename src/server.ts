import { server } from "./app.ts";
import { env } from "./config/env.ts";
import { registerShutdown } from "./lib/shutdown.ts";
import { closeNotificationsPublisher } from "./lib/notifications.ts";

server.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
  console.log(`🚀 HTTP server running on port ${env.PORT} (${env.NODE_ENV})`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────
registerShutdown("SHUTDOWN", [
  { name: "HTTP server", close: () => server.close() },
  { name: "Notifications publisher", close: closeNotificationsPublisher },
]);
