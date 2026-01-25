FROM node:25-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS las dependencias (incluyendo devDependencies para Prisma)
RUN npm ci

# Copiar el resto del código
COPY . .

# Generar Prisma Client (DATABASE_URL dummy solo para el build)
# Prisma generate no necesita una conexión real, solo el schema
ENV DATABASE_URL="postgresql://neondb_owner:npg_aXnZRm8Oe0YQ@ep-super-resonance-acbw5n3b-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
RUN npx prisma generate

EXPOSE 80

CMD ["npm", "run", "start"]