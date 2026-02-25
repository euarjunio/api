# Postman

Arquivos:
- `LIQUERA API.postman_collection.json`: collection com todas as rotas (`/health`, `/v1/**`) organizada por pastas.
- `LIQUERA Local.postman_environment.json`: environment com `baseUrl`, credenciais e variáveis (tokens/ids).

## Como usar

1. No Postman, **Import**:
   - a collection `postman/LIQUERA API.postman_collection.json`
   - o environment `postman/LIQUERA Local.postman_environment.json`
2. Selecione o environment **LIQUERA Local**.
3. Ajuste:
   - `baseUrl` (ex: `http://localhost:80`)
   - `userEmail`/`userPassword`
   - `adminEmail`/`adminPassword` (precisa existir no banco com `role=ADMIN`)
4. Rode:
   - `Auth -> POST /v1/auth/login (USER)` para preencher `token` e `authToken`
   - `Auth -> POST /v1/auth/login (ADMIN)` para preencher `adminToken`

## Variáveis do environment

| Variável | Tipo | Descrição |
|---|---|---|
| `baseUrl` | default | URL base da API (ex: `http://localhost:80`) |
| `userEmail` / `userPassword` | default | Credenciais do merchant |
| `adminEmail` / `adminPassword` | default | Credenciais do admin |
| `token` | secret | JWT do login do user (auto-preenchido) |
| `adminToken` | secret | JWT do login do admin (auto-preenchido) |
| `authToken` | secret | Token usado nas rotas autenticadas (auto = JWT; pode trocar por API Key) |
| `apiKey` | secret | API Key gerada (auto-preenchido) |
| `apiKeyId` | default | ID da API Key (auto-preenchido) |
| `merchantId` | default | ID do merchant (auto-preenchido) |
| `pixKeyId` / `pixKey` | default | Chave PIX do merchant (auto-preenchido) |
| `chargeId` / `txid` / `qrCode` | default | Dados da cobrança (auto-preenchido) |
| `idempotencyKey` | default | Chave de idempotência (auto-gerada) |
| `infractionId` | default | ID da infração (manual) |
| `webhookId` | default | ID do webhook do merchant (auto-preenchido no POST) |
| `merchantWebhookUrl` | default | URL de destino do webhook (ex: webhook.site) |
| `merchantWebhookSecret` | secret | Secret retornado ao criar webhook (auto-preenchido) |
| `transfeeraWebhookSecret` | secret | Secret para validar assinatura HMAC (manual) |
| `page` / `limit` | default | Paginação (default 1/20) |

## Notas rápidas

- **Auth híbrida (JWT ou API Key)**: nas rotas de merchants/charges/webhooks/merchant, use `Authorization: Bearer {{authToken}}`.
  - Para usar **JWT**, deixe `authToken = token` (o login já faz isso).
  - Para usar **API Key**, depois de criar uma (`API Keys -> POST /v1/api-keys`), copie `apiKey` para `authToken` (ou descomente a linha no script de teste da request).
- **Webhooks multi-endpoint**: cada merchant pode ter N webhooks, cada um inscrito em eventos específicos.
  - Use `GET /v1/webhooks/merchant/events` para ver os eventos disponíveis.
  - Ao criar com `events: []` (array vazio), o webhook recebe todos os eventos (wildcard).
  - O `secret` retornado no POST é salvo em `merchantWebhookSecret` e o `id` em `webhookId`.
  - Use `PATCH /v1/webhooks/merchant/:id` para atualizar url/name/events ou desativar (`status: INACTIVE`).
  - Use `DELETE /v1/webhooks/merchant/:id` para remover.
- **Admin — Adquirente**: as rotas usam nomes genéricos (`setup-acquirer`, `acquirer-balance`) via Strategy Pattern (implementação Transfeera).
- **Webhook Transfeera**: se `transfeeraWebhookSecret` estiver vazio, a rota aceita sem header de assinatura.
  - Se preencher `transfeeraWebhookSecret`, a request `POST /v1/webhooks/transfeera` gera automaticamente `Transfeera-Signature` no pre-request script.

