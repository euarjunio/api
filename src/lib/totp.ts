import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import { hash, verify } from "argon2";
import { env } from "../config/env.ts";

const ISSUER = "Liquera";
const ALGORITHM = "SHA1";
const DIGITS = 6;
const PERIOD = 30;

// ── Encryption helpers (AES-256-GCM) ────────────────────────────────

function getEncryptionKey(): Buffer {
  const hex = env.TOTP_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY must be a 64+ char hex string (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plainSecret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(encryptedStr: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, dataHex] = encryptedStr.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

// ── TOTP helpers ─────────────────────────────────────────────────────

export function generateSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

export function generateQrCodeUri(email: string, secret: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyToken(secret: string, code: string): boolean {
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

// ── Backup Codes ─────────────────────────────────────────────────────

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hash(code)));
}

export async function verifyBackupCode(
  code: string,
  hashedCodes: string[],
): Promise<number> {
  for (let i = 0; i < hashedCodes.length; i++) {
    try {
      if (await verify(hashedCodes[i], code)) return i;
    } catch {
      // hash inválido, skip
    }
  }
  return -1;
}
