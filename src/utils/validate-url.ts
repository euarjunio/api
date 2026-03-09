import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "[::1]",
  "[::0]",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

/**
 * Returns true when `rawUrl` points to a private/internal network
 * (localhost, RFC-1918, link-local, loopback) that must not be used as
 * a webhook destination.
 */
export function isPrivateUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(parsed.hostname)) return true;

  if (isIP(hostname) === 4) return isPrivateIPv4(hostname);

  if (isIP(hostname) === 6) {
    const lower = hostname.toLowerCase();
    return lower === "::1" || lower === "::0" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd");
  }

  return false;
}
