FROM node:25-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS las dependencias (incluyendo devDependencies para Prisma)
RUN npm ci

# Aceitar DATABASE_URL como build arg ANTES de gerar o Prisma Client
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Copiar el resto del código
COPY . .

# Generar Prisma Client (agora DATABASE_URL está disponível)
RUN npx prisma generate

ARG PORT
ENV PORT=$PORT

EXPOSE $PORT

CMD ["npm", "run", "start"]