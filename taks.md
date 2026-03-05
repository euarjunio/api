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

## 🔒 2FA
- [ ] Suporte a backup codes no endpoint `POST /auth/2fa/disable` (atualmente só aceita TOTP)


[ ] - pedir mais dados no kyc