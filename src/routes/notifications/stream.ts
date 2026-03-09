import { randomUUID } from "node:crypto";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Redis } from "ioredis";
import { prisma } from "../../lib/prisma.ts";
import { redis } from "../../lib/redis.ts";
import { env } from "../../config/env.ts";
import { authenticate } from "../hooks/authenticate.ts";

const MAX_GLOBAL_SSE = 500;
const MAX_PER_MERCHANT_SSE = 5;
const SSE_TOKEN_TTL = 60; // seconds
let globalSseCount = 0;
const merchantSseCount = new Map<string, number>();

export const streamNotificationsRoute: FastifyPluginAsyncZod = async (app) => {

  // POST /sse-token — generate a short-lived, single-use token for SSE
  app.post(
    "/sse-token",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Notifications"],
        summary: "Gerar token curto para SSE",
        description: "Gera um token de uso único (60s TTL) para conectar ao stream SSE sem expor o JWT na URL.",
        response: {
          200: z.object({ token: z.string(), expiresIn: z.number() }),
          401: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
        select: { id: true },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      const token = randomUUID();
      await redis.set(
        `sse-token:${token}`,
        JSON.stringify({ userId: request.user.id, merchantId: merchant.id }),
        "EX",
        SSE_TOKEN_TTL,
      );

      return reply.status(200).send({ token, expiresIn: SSE_TOKEN_TTL });
    },
  );

  // GET /stream — SSE endpoint
  app.get(
    "/stream",
    {
      schema: {
        tags: ["Notifications"],
        summary: "Stream de notificações em tempo real (SSE)",
        description:
          "Mantém conexão aberta e envia notificações via Server-Sent Events. " +
          "Use POST /sse-token para obter um token curto e passe via ?token=.",
        querystring: z.object({
          token: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const sseToken = (request.query as any).token;

      if (sseToken) {
        // Short-lived SSE token (preferred — keeps JWT out of URLs/logs)
        try {
          const raw = await redis.get(`sse-token:${sseToken}`);
          if (!raw) {
            return reply.status(401).send({ message: "Token inválido ou expirado" });
          }
          const data = JSON.parse(raw);
          request.user = { id: data.userId, role: "USER", merchantId: data.merchantId };
          // Single-use: delete after consumption
          await redis.del(`sse-token:${sseToken}`);
        } catch {
          return reply.status(401).send({ message: "Token inválido" });
        }
      } else {
        if (!request.user) {
          return reply.status(401).send({ message: "Token inválido" });
        }
      }

      const merchantId = request.user.merchantId;

      if (!merchantId) {
        const merchant = await prisma.merchant.findUnique({
          where: { userId: request.user.id },
          select: { id: true },
        });
        if (!merchant) {
          return reply.status(404).send({ message: "Merchant não encontrado" });
        }
        request.user.merchantId = merchant.id;
      }

      const mId = request.user.merchantId!;

      if (globalSseCount >= MAX_GLOBAL_SSE) {
        return reply.status(503).send({ message: "Limite de conexões SSE atingido. Tente novamente mais tarde." });
      }

      const currentMerchantCount = merchantSseCount.get(mId) ?? 0;
      if (currentMerchantCount >= MAX_PER_MERCHANT_SSE) {
        return reply.status(429).send({ message: "Limite de conexões SSE por merchant atingido." });
      }

      globalSseCount++;
      merchantSseCount.set(mId, currentMerchantCount + 1);

      reply.hijack();

      reply.raw.writeHead(200, {
        ...reply.getHeaders(),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      const subscriber = new Redis(env.REDIS_URL);
      const channel = `notify:${mId}`;

      await subscriber.subscribe(channel);

      subscriber.on("message", (_ch, message) => {
        reply.raw.write(`data: ${message}\n\n`);
      });

      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, 30_000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe(channel);
        subscriber.quit();

        globalSseCount = Math.max(0, globalSseCount - 1);
        const remaining = (merchantSseCount.get(mId) ?? 1) - 1;
        if (remaining <= 0) merchantSseCount.delete(mId);
        else merchantSseCount.set(mId, remaining);

        request.log.info(`[SSE] Desconectado | merchantId: ${mId}`);
      });

      request.log.info(`[SSE] Conectado | merchantId: ${mId}`);
    },
  );
};
