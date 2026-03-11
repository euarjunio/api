import { Queue } from "bullmq";
import { env } from "../config/env.ts";

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
  | "FEE_CHANGED"
  | "LEDGER_ADJUSTMENT";

interface LogActionInput {
  action: AuditAction;
  actor: string;
  target?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

export const auditQueue = new Queue<LogActionInput>("audit-logs", {
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

/**
 * Enqueues an audit log entry via BullMQ.
 * Falls back to direct DB write if Redis is unavailable.
 */
export function logAction(input: LogActionInput): void {
  auditQueue.add("audit", input).catch(async (err) => {
    console.warn(`📋 [AUDIT] Redis offline, fallback direto ao banco: ${err?.message}`);
    try {
      const { prisma } = await import("./prisma.ts");
      await prisma.auditLog.create({
        data: {
          action: input.action,
          actor: input.actor,
          target: input.target,
          metadata: input.metadata ?? undefined,
          ip: input.ip,
          userAgent: input.userAgent,
        },
      });
    } catch (dbErr: any) {
      console.error(`📋 [AUDIT] Erro ao registrar ação: ${dbErr?.message}`);
    }
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
