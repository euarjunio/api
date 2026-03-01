import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Redis } from "ioredis";
import { prisma } from "../../lib/prisma.ts";
import { env } from "../../config/env.ts";

export const streamNotificationsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/stream",
    {
      schema: {
        tags: ["Notifications"],
        summary: "Stream de notificações em tempo real (SSE)",
        description: "Mantém conexão aberta e envia notificações via Server-Sent Events",
        querystring: z.object({
          token: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      // Aceitar token via query string (EventSource não suporta headers customizados)
      const token = (request.query as any).token;
      if (token) {
        try {
          // Criar header Authorization temporário para jwtVerify
          const originalAuth = request.headers.authorization;
          request.headers.authorization = `Bearer ${token}`;
          await request.jwtVerify();
          // Restaurar header original
          request.headers.authorization = originalAuth;
        } catch {
          return reply.status(401).send({ message: "Token inválido" });
        }
      } else {
        // Se não tem token na query, usar o hook authenticate (já rodou)
        if (!request.user) {
          return reply.status(401).send({ message: "Token inválido" });
        }
      }

      const merchant = await prisma.merchant.findUnique({
        where: { userId: request.user.id },
      });

      if (!merchant) {
        return reply.status(404).send({ message: "Merchant não encontrado" });
      }

      // Tomar controle da resposta (evita Fastify tentar enviar resposta duplicada)
      reply.hijack();

      // Configurar SSE headers — incluir headers já setados pelo CORS plugin (reply.getHeaders)
      // para que o browser não bloqueie a conexão EventSource por falta de CORS headers.
      reply.raw.writeHead(200, {
        ...reply.getHeaders(),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Nginx/Fly.io: desabilitar buffering
      });

      // Enviar heartbeat inicial
      reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      // Redis subscriber dedicado para esta conexão
      const subscriber = new Redis(env.REDIS_URL);
      const channel = `notify:${merchant.id}`;

      await subscriber.subscribe(channel);

      subscriber.on("message", (_ch, message) => {
        reply.raw.write(`data: ${message}\n\n`);
      });

      // Heartbeat a cada 30s para manter a conexão viva
      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, 30_000);

      // Cleanup quando o cliente desconectar
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe(channel);
        subscriber.quit();
        request.log.info(`📡 [SSE] Desconectado | merchantId: ${merchant.id}`);
      });

      request.log.info(`📡 [SSE] Conectado | merchantId: ${merchant.id}`);
    },
  );
};
