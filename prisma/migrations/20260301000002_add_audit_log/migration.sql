-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor");
CREATE INDEX "audit_logs_target_idx" ON "audit_logs"("target");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
