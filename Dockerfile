# ═══════════════════════════════════════════════════════════
# Stage 1: Builder — instala tudo e gera o Prisma Client
# ═══════════════════════════════════════════════════════════
FROM node:25-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS as dependências (devDeps necessárias para prisma generate)
RUN npm ci

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Gerar Prisma Client
RUN npx prisma generate

# ═══════════════════════════════════════════════════════════
# Stage 2: Runner — imagem final leve, sem devDependencies
# ═══════════════════════════════════════════════════════════
FROM node:25-alpine AS runner

WORKDIR /app

COPY package*.json ./

# Instalar APENAS dependências de produção
RUN npm ci --omit=dev

# Copiar código-fonte e schema
COPY prisma ./prisma/
COPY src ./src/

# Copiar Prisma Client gerado do builder (sobrescreve o diretório do contexto)
COPY --from=builder /app/src/lib/generated/prisma ./src/lib/generated/prisma
COPY tsconfig.json ./

ARG PORT=80
ENV PORT=$PORT
ENV NODE_ENV=production

EXPOSE $PORT

CMD ["npm", "run", "start"]
