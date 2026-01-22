import crypto from "node:crypto";

/**
 * Ex: lk_test_WYmcnqKUxyYZFk0gWTxpdxfb
 * - Sem "-" nem "_"
 * - Somente [A-Za-z0-9]
 */
export function generateApiKey() {
  const prefix = process.env.NODE_ENV === "production" ? "lk_live" : "lk_test";

  // base64 pode ter + / =, então filtramos para alfanumérico
  // 32 bytes costuma sobrar com folga após filtrar
  let token = "";
  while (token.length < 24) {
    const chunk = crypto.randomBytes(32).toString("base64"); // pode ter + / =
    token += chunk.replace(/[^A-Za-z0-9]/g, ""); // remove + / =
  }

  token = token.slice(0, 24);
  return `${prefix}_${token}`;
}
