FROM node:25-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

EXPOSE 80

CMD ["npm", "run", "start"]

