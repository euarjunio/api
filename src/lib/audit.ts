import { prisma } from "./prisma.ts";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "2FA_ENABLED"
  | "2FA_DISABLED"
  | "2FA_ADMIN_RESET"
  | "PASSWORD_CHANGED"
  | "API_KEY_CREATED"
  | "API_KEY_DELETED"
  | "CHARGE_CREATED"
  | "WITHDRAW_REQUESTED"
  | "MERCHANT_APPROVED"
  | "MERCHANT_REJECTED"
  | "MERCHANT_BLOCKED"
  | "MERCHANT_UNBLOCKED"
  | "FEE_CHANGED";

interface LogActionInput {
  action: AuditAction;
  actor: string;                  // userId, "system", ou "admin:userId"
  target?: string;                // recurso afetado (merchantId, chargeId, etc.)
  metadata?: Record<string, any>; // payload extra
  ip?: string;
  userAgent?: string;
}

/**
 * Registra uma ação no audit log.
 * Fire-and-forget: não lança exceção se falhar (apenas loga no console).
 */
export function logAction(input: LogActionInput): void {
  prisma.auditLog
    .create({
      data: {
        action: input.action,
        actor: input.actor,
        target: input.target,
        metadata: input.metadata ?? undefined,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    })
    .catch((err) => {
      console.error(`📋 [AUDIT] Erro ao registrar ação: ${err?.message}`);
    });
}

/**
 * Helper para extrair IP e UserAgent de um FastifyRequest.
 */
export function getRequestContext(request: { ip: string; headers: Record<string, any> }) {
  return {
    ip: request.ip,
    userAgent: request.headers["user-agent"] as string | undefined,
  };
}
