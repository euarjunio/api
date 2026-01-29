FROM node:25-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS las dependencias (incluyendo devDependencies para Prisma)
RUN npm ci

# Copiar el resto del código
COPY . .

# Generar Prisma Client (não precisa de DATABASE_URL)
RUN npx prisma generate

# Aceitar variáveis de ambiente para runtime
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG PORT
ENV PORT=$PORT

EXPOSE $PORT

CMD ["npm", "run", "start"]