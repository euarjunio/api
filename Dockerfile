# syntax=docker/dockerfile:1

# ═══════════════════════════════════════════════════════════
# Stage 1: Builder — instala tudo e gera o Prisma Client
# ═══════════════════════════════════════════════════════════
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS as dependências (devDeps necessárias para prisma generate)
RUN npm ci

# Use BuildKit secret for DATABASE_URL (not stored in layer history)
RUN --mount=type=secret,id=DATABASE_URL \
    DATABASE_URL="$(cat /run/secrets/DATABASE_URL)" \
    npx prisma generate

# ═══════════════════════════════════════════════════════════
# Stage 2: Runner — imagem final leve, sem devDependencies
# ═══════════════════════════════════════════════════════════
FROM node:24-alpine AS runner

WORKDIR /app

COPY package*.json ./

# Instalar APENAS dependências de produção
RUN npm ci --omit=dev

# Copiar código-fonte e schema
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY src ./src/

# Copiar Prisma Client gerado do builder (sobrescreve o diretório do contexto)
COPY --from=builder /app/src/lib/generated/prisma ./src/lib/generated/prisma
COPY tsconfig.json ./

ARG PORT=80
ENV PORT=$PORT
ENV NODE_ENV=production

EXPOSE $PORT

CMD ["npm", "run", "start"]
