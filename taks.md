## PLANO DE DESENVOLVIMENTO

---

### ✅ [DONE] Arrumar Tracking (UTMify)
- Skip silencioso quando customer não tem email/phone
- Enriquecer payload do cashin com customer do banco
- Sem retries desnecessários (erro 400 vira silêncio)

---

### [ ] 1. Link de Pagamento ← PRÓXIMO (mais impacto no negócio)

**API (`C:\Users\rip\Desktop\api`)**
- [ ] Prisma: model `PaymentLink` com campos:
        id, name, slug (unique, gerado auto ex: "lk_xxxx"), amount (centavos),
        description (opcional), expiresAt (datetime), status (ACTIVE/PAID/EXPIRED/DISABLED),
        paymentMethod (PIX só por ora), paidAt, metadata (tracking UTMs opcionais)
        merchantId, chargeId (nullable — preenchido quando pago)
- [ ] Migration: `20260228_add_payment_links`
- [ ] Rotas autenticadas (merchant):
        POST   /v1/payment-links           → criar link
        GET    /v1/payment-links           → listar (paginado, filtro status)
        GET    /v1/payment-links/:id       → detalhe
        PATCH  /v1/payment-links/:id       → editar (nome, descrição, expiresAt)
        DELETE /v1/payment-links/:id       → desativar (status DISABLED)
- [ ] Rota pública (sem auth):
        GET    /v1/pay/:slug               → retorna dados do link (nome, valor, status, qrCode se já gerado)
        POST   /v1/pay/:slug/checkout      → gera cobrança PIX, vincula ao link, retorna qrCode
- [ ] Cron/job: expirar links (ACTIVE → EXPIRED) via BullMQ com delay até expiresAt
- [ ] Redis cache: lista de links por merchant (TTL 15s), invalida ao criar/editar/desativar
- [ ] Webhook cashin: quando pagar uma charge que tem linkId, marcar link como PAID + paidAt

**Web (`C:\Users\rip\Desktop\web`)**
- [ ] Refatorar `/payment-links/page.tsx` (hoje é mock) → real com useQuery
- [ ] Hook `use-payment-links.ts`, `use-create-payment-link.ts`, `use-delete-payment-link.ts`
- [ ] Drawer "Criar Link" com campos: nome, valor, data expiração, descrição
- [ ] Coluna "Link" com botão copiar URL pública (`/pay/[slug]`)
- [ ] Página pública `/pay/[slug]` (no próprio web, fora do layout privado):
        exibe nome do link, valor, QR Code PIX + copia-cola, polling status (SSE ou refetch 3s)

---

### [ ] 2. 2FA Opcional (TOTP)

**API**
- [ ] Prisma: adicionar ao model User:
        twoFactorEnabled Boolean @default(false) @map("two_factor_enabled")
        twoFactorSecret  String? @map("two_factor_secret")   ← encriptado
        twoFactorBackupCodes String[] @default([])            ← hasheados
- [ ] Migration: `add_2fa_to_users`
- [ ] `src/lib/totp.ts` usando `otplib`:
        generateSecret(), generateQrCodeUrl(), verifyToken(), generateBackupCodes()
- [ ] Rotas (autenticadas):
        GET    /v1/auth/2fa/setup     → gera secret + QR code URI (não ativa ainda)
        POST   /v1/auth/2fa/enable    → body: { code } → valida TOTP e ativa
        POST   /v1/auth/2fa/disable   → body: { code, emailCode } → valida TOTP + código email antes de desativar
        POST   /v1/auth/2fa/verify    → body: { code } → usado no login step-2 (retorna JWT final)
        GET    /v1/auth/2fa/backup-codes → lista códigos de backup (mascarados)
- [ ] Atualizar POST /v1/auth/login:
        Se user tem 2FA ativo → não retorna JWT definitivo,
        retorna { requiresTwoFactor: true, tempToken: "..." } (JWT curto, 5min, scope "2fa")
        Frontend chama /2fa/verify com o tempToken + code → recebe JWT definitivo
- [ ] Email de aviso ao ativar/desativar 2FA

**Web**
- [ ] Seção "Segurança" na página de perfil:
        Toggle para ativar 2FA
        Drawer setup: mostra QR code + campo para confirmar o código do app
        Drawer desativar: campo TOTP + campo código email
        Lista de códigos de backup (com botão regenerar)
- [ ] Tela de verificação 2FA no login (após senha correta, se 2FA ativo):
        `/auth/two-factor` com campo do código TOTP ou backup code

---

### [ ] 3. Refetch e Redis — Limpeza e padronização

**Redis (API)** — o que já existe está bom, só ajustar:
- [ ] Adicionar cache para links de pagamento (quando o feature acima for feito)
- [ ] Revisar `invalidateMerchantCaches`: incluir payment-links quando existir
- [ ] Não adicionar cache em: notificações, kyc-status, infrações (dado sensível/tempo-real)

**Frontend (Web)** — padronizar `staleTime` e remover refetch desnecessário:
- [ ] `use-notifications.ts`: ok, SSE já é real-time (não precisa de polling)
- [ ] `use-webhook-events.ts`: checar se refetchInterval faz sentido ou se basta `staleTime`
- [ ] `use-pix-key.ts`: checar se tem refetch automático que não precisa
- [ ] Padrão a seguir:
        Cobranças/Transações → staleTime: 10_000 (10s), sem refetchInterval
        Saldo → staleTime: 15_000 (15s), refetchOnWindowFocus: true
        Perfil/Config → staleTime: 60_000 (1min), sem refetch
        Links de pagamento → staleTime: 10_000 (10s)
        Dados real-time (notificações, status de pagamento) → SSE/polling explícito

---

### [ ] 4. Documentação da API

- [ ] Revisar e completar as tags/descriptions de todas as rotas no Swagger (fastify schema)
- [ ] Garantir que todas as rotas de erro (401, 403, 404, 422) estão documentadas
- [ ] Página `/documentation` no web:
        Link para o Swagger UI (`/docs`) em dev
        Em prod: embed de um README ou documentação estática gerada do OpenAPI
- [ ] Exportar OpenAPI JSON como artefato de build (para integração externa)
