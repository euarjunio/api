## LIQUERA API (Gateway PIX)

API de pagamentos PIX (cobranças + split de taxa) com onboarding de **merchant**, **KYC**, integração com **adquirente** (Transfeera via Strategy Pattern), storage de documentos (S3-compatible / Cloudflare R2), **ledger** (livro razão), **saques**, **webhooks multi-endpoint** e **worker** dedicado (BullMQ).

### Fluxo principal (diagrama Mermaid)

```mermaid
sequenceDiagram
  autonumber
  actor Merchant as Merchant (lojista)
  actor Payer as Pagador
  participant API as Gateway API (Fastify)
  participant DB as PostgreSQL (Prisma)
  participant R2 as R2/S3 (documentos KYC)
  participant Admin as Admin (compliance)
  participant ACQ as Adquirente (Transfeera)
  participant WH as Webhook Adquirente (/v1/webhooks/transfeera)
  participant Redis as Redis + BullMQ
  participant MWH as Webhook do Merchant (URL cadastrada)

  Merchant->>API: POST /v1/auth/register
  Merchant->>API: POST /v1/auth/login (JWT)
  Merchant->>API: POST /v1/merchants (cria perfil)
  Merchant->>API: POST /v1/merchants/me/documents (multipart)
  API->>R2: Upload docFront/docBack/docSelfie
  API->>DB: kycStatus = UNDER_REVIEW

  Admin->>API: POST /v1/admin/merchants/:id/approve
  API->>DB: kycStatus = APPROVED
  API->>ACQ: Cria conta do merchant (adquirente)
  API->>DB: acquirerAccountId

  Merchant->>API: POST /v1/merchants/me/pix-keys (cria CHAVE_ALEATORIA)
  API->>ACQ: Cria chave PIX
  API->>DB: pixKey/pixKeyId

  Merchant->>API: POST /v1/charges (x-idempotency-key opcional)
  API->>ACQ: Cria cobrança imediata (QR Code + split)
  API->>DB: charges(status=PENDING, txid, qrCode)

  Payer->>ACQ: Paga o PIX (txid)
  ACQ->>WH: POST evento CashIn
  WH->>API: Valida assinatura (opcional via TRANSFEERA_WEBHOOK_SECRET)
  API->>DB: charges(status=PAID) + registra ledger(PENDING)
  API->>Redis: Enfileira liquidação (delay SETTLEMENT_DELAY_MS)
  Redis->>DB: Worker liquida ledger (PENDING → AVAILABLE)

  API->>Redis: Enfileira notificação do merchant
  Redis->>MWH: Worker envia POST (x-webhook-secret, x-delivery-id)
  Redis->>DB: Salva log de entrega (webhook_logs)

  Note over ACQ,WH: ── Infrações PIX (MED) ──
  ACQ->>WH: POST evento Infraction
  WH->>API: Valida assinatura + processa
  API->>DB: Cria/atualiza infração (status=PENDING)
  API->>Redis: Notifica merchant (infraction.received)

  Merchant->>API: POST /v1/merchants/me/infractions/:id/analyze
  API->>DB: merchantAnalysis + status=AWAITING_APPROVAL

  Admin->>API: POST /v1/admin/infractions/:id/approve
  API->>ACQ: POST /med/infractions/:id/analysis
  API->>DB: sentAnalysis + analysisStatus=ACCEPTED/REJECTED
```

### Stack

- **Runtime**: Node.js (TypeScript) com `tsx`
- **API**: Fastify + Zod v4 (`fastify-type-provider-zod`)
- **Banco**: PostgreSQL (Prisma + `@prisma/adapter-pg`)
- **Filas / Jobs**: BullMQ + Redis — worker dedicado (`src/worker.ts`, processo separado no deploy)
- **Integrações**: Adquirente via Strategy Pattern (`src/providers/`), implementação Transfeera. Cloudflare R2 (S3-compatible) para KYC.
- **Observabilidade**: Sentry (opcional, obrigatório em produção)
- **Docs**: Swagger UI em `GET /docs` (controlado por `ENABLE_SWAGGER`)

### Rotas (resumo)

- **Health**
  - `GET /health` — verifica API + Redis + Postgres (retorna `status: ok | degraded`)
- **Auth**
  - `POST /v1/auth/register`
  - `POST /v1/auth/login`
- **Merchants** (autenticado via `Authorization: Bearer <JWT>` **ou** `Bearer <API_KEY lk_...>`)
  - `POST /v1/merchants`
  - `GET /v1/merchants/me`
  - `PATCH /v1/merchants/me`
  - `POST /v1/merchants/me/documents` (multipart: docFront, docBack, docSelfie)
  - `GET /v1/merchants/me/documents/kyc-status`
  - `POST /v1/merchants/me/pix-keys` (cria chave aleatória)
  - `GET /v1/merchants/me/pix-keys` (lista chaves)
  - `GET /v1/merchants/me/balance`
  - `GET /v1/merchants/me/balance/transactions`
  - `POST /v1/merchants/me/withdrawals`
  - `GET /v1/merchants/me/withdrawals`
  - `GET /v1/merchants/me/infractions` (lista infrações MED)
  - `GET /v1/merchants/me/infractions/:id` (detalhe)
  - `POST /v1/merchants/me/infractions/:id/analyze` (enviar análise)
- **Charges** (autenticado; idempotência via `x-idempotency-key`)
  - `POST /v1/charges`
  - `GET /v1/charges`
- **API Keys** (exige **JWT**; gera `lk_test_...` em sandbox e `lk_live_...` em produção)
  - `POST /v1/api-keys`
  - `GET /v1/api-keys`
  - `DELETE /v1/api-keys/:id`
- **Admin** (exige **JWT** com `role=ADMIN`)
  - `GET /v1/admin/merchants`
  - `GET /v1/admin/merchants/pending-kyc`
  - `GET /v1/admin/merchants/:id`
  - `POST /v1/admin/merchants/:id/approve`
  - `POST /v1/admin/merchants/:id/reject`
  - `POST /v1/admin/merchants/:id/set-fee`
  - `POST /v1/admin/merchants/:id/setup-acquirer`
  - `POST /v1/admin/merchants/:id/block`
  - `POST /v1/admin/merchants/:id/unblock`
  - `GET /v1/admin/merchants/:id/acquirer-balance`
  - `GET /v1/admin/infractions` (lista todas infrações MED)
  - `GET /v1/admin/infractions/:id` (detalhe completo)
  - `POST /v1/admin/infractions/:id/approve` (aprova e envia ao adquirente)
  - `POST /v1/admin/infractions/sync` (sincroniza com adquirente)
- **Webhooks — Merchant** (autenticado; multi-endpoint: cada merchant pode ter N webhooks)
  - `GET /v1/webhooks/merchant/events` (lista eventos disponíveis)
  - `POST /v1/webhooks/merchant` (cria webhook com url + name + events)
  - `GET /v1/webhooks/merchant` (lista todos webhooks + últimos logs)
  - `PATCH /v1/webhooks/merchant/:id` (atualiza url, name, events ou status)
  - `DELETE /v1/webhooks/merchant/:id` (remove webhook)
- **Webhooks — Transfeera** (público; assinatura HMAC-SHA256 opcional)
  - `POST /v1/webhooks/transfeera` (eventos: CashIn, Transfer, PixKey, Infraction)

### Requisitos

- **Node.js** (recomendado: o mesmo do `Dockerfile`, `node:25-alpine`)
- **PostgreSQL** e **Redis**
  - Para desenvolvimento local, use `docker-compose.yml` (subirá ambos)

### Configuração (variáveis de ambiente)

Crie um arquivo `.env` na raiz do projeto.

> Dica: no `docker-compose.yml` a senha do Postgres é `pdw@123` — em `DATABASE_URL` o `@` precisa ser **URL-encoded** (`%40`).

Exemplo mínimo para rodar local (ajuste conforme seu ambiente):

```env
NODE_ENV=development
APP_ENV=sandbox
PORT=80

# URL pública da API (obrigatório em produção)
# API_BASE_URL=https://api.liquera.com.br

DATABASE_URL=postgresql://postgres:pdw%40123@localhost:5432/gateway
REDIS_URL=redis://localhost:6379

JWT_SECRET=change-me
JWT_EXPIRES_IN=7d

# CORS (default "*" em sandbox; obrigatório lista explícita em produção)
ALLOWED_ORIGINS=*

# Transfeera (adquirente)
URL_TRANSFEERA=https://api.transfeera.com
URL_TRANSFEERA_AUTH=https://auth.transfeera.com
TRANSFEERA_CLIENT_ID=...
TRANSFEERA_CLIENT_SECRET=...
TRANSFEERA_CUSTOMER_ID=...

PLATFORM_PIX_KEY=...
PLATFORM_PIX_KEY_TYPE=CHAVE_ALEATORIA

# Se setado, exige header Transfeera-Signature no webhook (obrigatório em produção)
TRANSFEERA_WEBHOOK_SECRET=

# Webhook do merchant (entrega)
MERCHANT_WEBHOOK_TIMEOUT_MS=5000
MERCHANT_WEBHOOK_MAX_RETRIES=3

# Rate limit (por minuto; em sandbox os limites são 2x)
RATE_LIMIT_GLOBAL=100
RATE_LIMIT_CHARGE=30
RATE_LIMIT_AUTH=10

# Liquidação do ledger (ms)
SETTLEMENT_DELAY_MS=30000

# Saque mínimo (centavos)
MIN_WITHDRAW_AMOUNT=100

# Cloudflare R2 (S3)
R2_BUCKET_NAME=...
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# Swagger UI (default true; desabilite em produção se quiser)
ENABLE_SWAGGER=true

# Observabilidade (obrigatório em produção)
SENTRY_DSN=
```

### Rodando localmente (Docker Compose)

Suba dependências:

```bash
docker compose up -d
```

Instale dependências e aplique migrations:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Inicie a API + Worker:

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — Worker (BullMQ: liquidação, webhooks)
npm run dev:worker
```

- API: `http://localhost:<PORT>`
- Swagger UI: `GET /docs` (quando `ENABLE_SWAGGER=true`)

### Criando um ADMIN (para aprovar KYC)

Não existe rota pública para promover usuário a admin. Em ambiente local, você pode:

- Criar um usuário via `POST /v1/auth/register`
- No banco, atualizar a role:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'seu-admin@exemplo.com';
```

### Postman

Veja a pasta `postman/`:

- `postman/LIQUERA API.postman_collection.json`
- `postman/LIQUERA Local.postman_environment.json`

### Deploy (Fly.io)

O `fly.toml` usa `internal_port = 80` e dois processos:

- **app** — `node --import tsx src/server.ts` (API Fastify)
- **worker** — `node --import tsx src/worker.ts` (BullMQ jobs)

Migrations rodam no release command: `npx prisma migrate deploy`