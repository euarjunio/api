FROM node:25-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS las dependencias (incluyendo devDependencies para Prisma)
RUN npm ci

# Copiar el resto del código
COPY . .

# Aceitar DATABASE_URL como build arg
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG PORT
ENV PORT=$PORT

# Generar Prisma Client
RUN npx prisma generate

EXPOSE $PORT

CMD ["npm", "run", "start"]