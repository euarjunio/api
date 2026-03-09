# Backlog — Liquera Gateway

## 🔐 Segurança

- [ ] Cloudflare Turnstile (captcha) nas rotas de auth (login, register, forgot-password) e checkout
- [ ] Mover domínios para Cloudflare (proxy, WAF, SSL)

## 💸 Financeiro

- [x] Limite de saques diário + taxa por saque (limite por transação + diário implementados; taxa por saque adiada)
- [x] Mostrar taxa descontada na transação do merchant (exibir split na listagem/detalhe)

## ⚙️ Infra / DevOps

- [x] Separar variáveis de ambiente prod vs dev (`.env.production`, `.env.development`)
- [x] Recuperação de PIX em caso de Redis offline — persistir fila de eventos para não perder transações
- [x] Trocar Node.js 25 (Current) para **Node.js 24 LTS** no Dockerfile — versão mais estável para produção

## 🔴 Redis / BullMQ (custo $5+ no Upstash — 3,4M comandos)

- [x] Adicionar `drainDelay: 30_000` nos 4 workers BullMQ (email, webhook, settlement, tracking) — reduz ~95% dos comandos Redis quando filas estão ociosas
- [x] Adicionar `stalledInterval: 120_000` e `maxStalledCount: 2` — stalled check a cada 2min ao invés de 30s
- [x] Problema identificado: workers fazem polling a cada ~1-2s mesmo sem jobs, gerando ~1,6M cmds/dia desnecessários

## 📊 Monitoramento / Observabilidade

- [x] Instalar `prom-client` e criar endpoint `/metrics` (Prometheus) — CPU, memória, event loop lag, conexões
- [x] Adicionar hook `onResponse` no Fastify para tracking de tempo de resposta por rota (top endpoints)
- [x] Logar requests lentos (>1s) automaticamente com rota e duração
- [x] Adicionar `$extends` no Prisma para medir e logar queries lentas (>500ms)
- [x] Expor métricas das filas BullMQ (waiting, active, failed) no `/metrics`

## 🔒 2FA

- [x] Suporte a backup codes no endpoint `POST /auth/2fa/disable` (atualmente só aceita TOTP)

## 📋 Outros

- [x] Pedir mais dados no KYC — CNPJ: contrato social, cartão CNPJ, dados do sócio (nome, CPF, docs frente/verso/selfie). CPF mantém 3 docs.
- [x] quando confirmar email de cadastro enviar outro falando que o email foi confirmado.
- [x] colocar uma parte para mostrar as taxas pro merchant para ele ficar ciente das taxas.
- [x] ~~fazer um clean code no projeto por completo~~ — analisado, não compensa refatoração total. Ações cirúrgicas priorizadas abaixo.
- [x] adicionar na criação de conta nome completo,email,telefone contato , senha e confirmar senha so no frontend
- [x] quando for enviar os documentos nao aparecer dashboard acha da hora aparecer navbar?
- [x] arrumar taxas mostradas pro merchant
- [x] arrumar erro 404 quando merchant vai enviar documentos (AxiosError no web)
- [x] arrumar profile colocar em tabs muito melhor
- [x] aumentar texto dashboard da esquerda muito pequena
- [x] verificação 2FA/email para criar API key e webhook (segurança)

- [ ] - olhar os Plugins
- [ ] - quando reijetar o usuário mostra reason para ele.

## 🧹 Clean Code — Prioridades (resultado da análise)

> Refatoração completa **não compensa** — o código está funcional, seguro e razoavelmente organizado.
> Abaixo estão as ações que **realmente valem a pena**, ordenadas por impacto/esforço.

### P0 — Fazer primeiro (rápido, impacto real)

- [x] Criar helper `requireMerchant(userId, select?)` — elimina lookup duplicado em 35+ rotas
- [x] Tipar `any` nos pontos críticos — `ledger.service.ts` (`ledgerEntry?: LedgerModel`), `webhooks/transfeera/handler.ts` (interfaces tipadas), `admin/merchants/list.ts` (`Prisma.MerchantWhereInput`)
- [x] Extrair `queueEmailSafe(to, template, logContext)` — mesmo try/catch de email repetido em 6+ rotas

### P1 — Fazer quando tiver testes de integração

- [x] Extrair `WithdrawalService` — mover lógica de 2FA + validações + batch Transfeera para fora de `withdrawals/create.ts` (325 linhas → ~90 no handler)
- [x] Extrair `ChargeService` — mover idempotência + customer find-or-create + acquirer call para fora de `charges/create.ts` (323 linhas → ~120 no handler)
- [x] Criar `MerchantService` — centralizar approve/reject/block que hoje vivem nos handlers admin

### P2 — Backlog (cosmético, baixo risco)

- [x] Mover magic numbers para config/env — `src/config/constants.ts` com `MAX_2FA_ATTEMPTS`, `LOCKOUT_TTL_SECONDS`, `MAX_FILE_SIZE`, `SIGNED_URL_EXPIRY`, etc.
- [x] Padronizar error classes (`NotFoundError`, `ForbiddenError`) — criados em `src/routes/errors/` + registrados no error handler do `app.ts`
- [x] Consistência de cache invalidation — documentado quando usar `invalidatePattern` vs `invalidateMerchantCaches` em `src/lib/cache.ts`

## 🆕 Implementado (06/03/2026 — Lote KYC + Taxas + UX)

### KYC Avançado (CPF vs CNPJ)

- [x] Campos no Prisma: `partnerName`, `partnerDocument`, `socialContractUrl`, `cnpjCardUrl`, `partnerDocFrontUrl`, `partnerDocBackUrl`, `partnerDocSelfieUrl`
- [x] Migration `add_kyc_cnpj_fields` aplicada
- [x] API: `PATCH /merchants/me/partner` — salvar dados do sócio (nome + CPF) antes do upload
- [x] API: Upload atualizado — aceita 8 docs para CNPJ (contrato social, cartão CNPJ, 3 docs pessoais + 3 docs sócio)
- [x] API: Validação de magic bytes (assinatura real do arquivo, não só extensão/mime)
- [x] API: Sanitização de nome de arquivo no upload
- [x] Web: Onboarding diferencia CPF/CNPJ — formulário do sócio + uploads extras
- [x] Admin: Merchant detail exibe dados do sócio + documentos CNPJ (contrato, cartão, docs do sócio)

### Emails de Notificação

- [x] Email após confirmar email (`emailVerifiedConfirmation`) — avisa que email foi verificado
- [x] Email após enviar documentos KYC (`kycUnderReviewEmail`) — avisa que docs estão em análise
- [x] Email quando KYC rejeitado (`merchantRejectedEmail`) — envia motivo da rejeição
- [x] Email quando KYC aprovado já existia (`merchantApprovedEmail`)

### Taxas e Limites (Merchant)

- [x] API: Endpoint `GET /merchants/me/fee-summary` — retorna total pago em taxas (transação + saque)
- [x] API: `GET /merchants/me` agora retorna `withdrawFee`, `maxWithdrawAmount`, `dailyWithdrawLimit`
- [x] Web: Card de Taxas no perfil mostra: taxa por transação, taxa de saque, limites, total pago em taxas
- [x] Defaults do merchant atualizados no Prisma: taxa por transação `R$ 0,70`, taxa de saque `R$ 5,00`, limite por saque `R$ 5.000,00`, limite diário `R$ 5.000,00`, limite mensal `R$ 400.000,00`, ticket mínimo `R$ 1,00`, ticket máximo `R$ 120,00`, limite noturno `R$ 1.000,00`

### Bug Fixes e UX

- [x] Web: Erro 403 no saque (2FA não ativado) — mostra alerta inline com CTA para ativar 2FA em vez de toast genérico
- [x] Web: Drawer mobile sumindo ao digitar — `repositionInputs={false}` no Vaul corrige teclado virtual
- [x] Admin: Audit logs — modal com JSON completo formatado + botão copiar (substituiu tooltip truncado)
- [x] Admin: Merchant detail — exibe `withdrawFee`, `maxWithdrawAmount`, `dailyWithdrawLimit` na visão geral

---

# Auditoria Completa da API (06/03/2026)

## 🚨 CRÍTICO — Corrigir Imediatamente

### Segurança

- [x] API Keys em texto puro no banco — `prisma/schema.prisma` + `hooks/authenticate.ts`. Hash com SHA-256 antes de armazenar
- [x] API Keys expostas no endpoint de listagem — `api-keys/list.ts`. Mascarar após criação (`lk_live_****xxxx`)
- [x] SSRF via webhook URLs — `webhooks/merchant/create.ts`. Validar contra IPs privados (localhost, 169.254.x.x, 10.x.x.x)
- [x] Webhook secret enviado como header plaintext — `webhook-queue.ts:64`. Trocar para HMAC-SHA256 no body
- [x] Timing attack na verificação de webhook Transfeera — `transfeera.provider.ts:312`. Trocar `===` por `crypto.timingSafeEqual()`

### Race Conditions / Dados Financeiros

- [x] Double-spend em saques concorrentes — `ledger.service.ts:222-258`. Usar advisory lock ou `SELECT FOR UPDATE` em `$transaction`
- [x] CashIn duplicado cria entradas duplas no ledger — `handler.ts:243-269`. Usar `updateMany WHERE status = 'PENDING'` atômico
- [x] CashIn não é atômico — charge update + ledger + settlement são operações separadas. Usar `$transaction`
- [x] Merchant bloqueado ainda recebe pagamentos — `handleCashIn` não verifica `merchant.status`

### Performance / Banco de Dados

- [x] `charges.customerId` sem index — FK usada em relações e filtros. Full table scan
- [x] `charges.createdAt` sem index — usado em ORDER BY + WHERE ranges em toda listagem
- [x] N+1 na sincronização de infrações — `admin/infractions/sync.ts`. Até 200 queries sequenciais. Batch-fetch
- [x] Sem paginação em merchants pendentes KYC — `admin/merchants/list-pending.ts`. Carrega TODOS na memória
- [x] API Key auth bate no banco a cada request — `hooks/authenticate.ts:27-34`. Cachear no Redis (TTL 60s)

## ⚠️ ALTO — Corrigir Esta Semana

### Segurança

- [x] Sem revogação de JWT após trocar senha/2FA — tokens antigos válidos por 7 dias. Blacklist no Redis
- [x] Webhook Transfeera aceita requests sem assinatura quando secret não configurado — `handler.ts:39`
- [x] Sem validação de MIME type em upload de documentos — `upload.ts:41-48`. Pode subir HTML/SVG/exe
- [x] Admin routes sem hook global de auth — `admin/index.ts`. Adicionar `verifyAdmin` global no registro

### Race Conditions

- [x] Idempotency key race condition em charge creation — `charges/create.ts:102-133`. Usar Redis NX lock
- [x] Redis down perde settlement jobs silenciosamente — CashIn marca PAID mas settlement não enfileira. Transactional outbox
- [x] Refund não é atômico com atualização de charge — `handler.ts:537-574`. Usar `$transaction`

### Indexes Faltando

- [x] `charges` — adicionar `@@index([merchantId, createdAt])`, `@@index([merchantId, status, createdAt])`, `@@index([status])`, `@@index([status, paidAt])`, `@@index([createdAt])`
- [x] `ledger` — adicionar `@@index([merchantId, type, createdAt])`
- [x] `infraction` — adicionar `@@index([merchantId, createdAt])`

### Performance de Código

- [x] 12+ rotas buscam Merchant completo quando só precisam do `id` — usar `select: { id: true }`
- [x] `charges/create.ts` busca merchant completo no hot path — endpoint mais chamado, busca 20+ colunas
- [x] Awaits sequenciais para URLs de storage — `list-pending.ts` e `get-detail.ts`. Usar `Promise.all`
- [x] SSE cria conexão Redis ilimitada por cliente — `notifications/stream.ts:66`. Limitar conexões

## 🔶 MÉDIO — Corrigir Este Sprint

### Segurança

- [x] `/metrics` público sem auth — proteger com token ou restringir a rede interna
- [x] Sem security headers — instalar `@fastify/helmet` (HSTS, X-Content-Type-Options, X-Frame-Options)
- [x] Rate limiting desabilitado quando Redis cai (`skipOnError: true`) — fallback in-memory
- [x] JWT em query string no SSE endpoint — logado em proxies. Usar token curto dedicado
- [x] Webhook Transfeera sem rate limiting — `allowList` exclui da proteção
- [x] Swagger habilitado por padrão — desabilitar em produção
- [x] User enumeration no registro — "email já cadastrado" revela existência
- [x] Request ID controlado pelo cliente — sanitizar contra log injection
- [x] Política de senha fraca — min 6 chars sem complexidade. Exigir maiúscula/número/especial
- [x] TOTP encryption key fallback all-zeros em dev — `lib/totp.ts:14-18`
- [x] Merchant bloqueado pode gerenciar API keys — `verifyJwt` não checa status

### Indexes

- [x] `merchant` — adicionar `@@index([status, kycStatus])`, `@@index([createdAt])`
- [x] `ledger` — adicionar `@@index([type])` (dashboard admin)

### Performance

- [x] JSON path query em `sync.ts` não usa index — criar GIN index ou desnormalizar `end2end_id`
- [x] Recovery worker updates sequenciais no loop — usar `updateMany` em batch
- [x] Relação filter em `customers/list.ts` sem index — depende do index `charges.customerId`
- [x] Admin merchants list sem `select` — busca 20+ colunas desnecessárias
- [x] Admin infractions list sem `select` — busca 30+ colunas desnecessárias

### Cenários Caóticos

- [x] Orphaned charges no acquirer quando DB falha após criar cobrança — criar registro local antes do acquirer
- [x] Audit logs fire-and-forget — podem ser perdidos sob carga. Enfileirar via BullMQ
- [x] Sem limite superior em valores de cobrança — `z.number().int().min(1)` sem `.max()`. Adicionar max
- [x] Fee zero cria ledger entry vazia — pular entry quando `feeAmount === 0`
- [x] Sem job de expiração para charges PIX pendentes — criar cleanup periódico
- [x] Sem circuit breaker para PostgreSQL — requests hammering DB morto
- [x] File uploads lidos inteiros na memória — até 15MB por request. Usar streaming

## 📝 BAIXO — Backlog

- [x] `console.error(error)` no error handler expõe stack em logs
- [x] `$queryRawUnsafe` no health check — padrão perigoso, usar `$queryRaw` com template
- [x] `DATABASE_URL` como build arg no Dockerfile — fica no layer history. Usar `--secret`
- [x] Webhook responses armazenados até 1000 chars — potencial data leak
- [x] Customer table global sem scoping por merchant — possível DoS via reserva de documents
- [x] Sem paginação em API keys list — `api-keys/list.ts`
- [x] Pool size do banco não configurado — usar `pool: { max: 20 }` no PrismaPg
- [x] Audit log substring search sem index
