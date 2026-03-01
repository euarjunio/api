import crypto from "node:crypto";
import { hash, verify } from "argon2";
import { prisma } from "./prisma.ts";
import { env } from "../config/env.ts";
import type { CodeType } from "./generated/prisma/enums.ts";

// Gera código numérico de 6 dígitos
export function generateCode(): string {
  return crypto.randomInt(100_000, 999_999).toString();
}

// Cria código no banco (invalida anteriores do mesmo tipo)
export async function createVerificationCode(userId: string, type: CodeType) {
  // Invalida códigos anteriores não usados
  await prisma.verificationCode.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() }, // marca como "expirado"
  });

  const plainCode = generateCode();
  const hashedCode = await hash(plainCode);

  await prisma.verificationCode.create({
    data: {
      userId,
      type,
      code: hashedCode,
      expiresAt: new Date(Date.now() + env.CODE_EXPIRY_MINUTES * 60 * 1000),
    },
  });

  return plainCode; // retorna o código plain para enviar no email
}

// Verifica e consome o código
export async function verifyCode(
  userId: string,
  type: CodeType,
  plainCode: string,
): Promise<boolean> {
  const codes = await prisma.verificationCode.findMany({
    where: {
      userId,
      type,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (codes.length === 0) return false;

  const valid = await verify(codes[0].code, plainCode);

  if (valid) {
    await prisma.verificationCode.update({
      where: { id: codes[0].id },
      data: { usedAt: new Date() },
    });
  }

  return valid;
}

// Checa cooldown anti-spam
export async function checkCooldown(userId: string, type: CodeType): Promise<boolean> {
  const lastCode = await prisma.verificationCode.findFirst({
    where: { userId, type },
    orderBy: { createdAt: "desc" },
  });

  if (!lastCode) return true; // pode enviar

  const elapsed = Date.now() - lastCode.createdAt.getTime();
  return elapsed >= env.CODE_COOLDOWN_SECONDS * 1000;
}
