import { server } from "./app.ts";
import { env } from "./config/env.ts";

server.listen({ port: env.PORT, host: "0.0.0.0" }, () => {
  console.log(`HTTP server running on port ${env.PORT}`);
});