import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.ts";
import { authenticate } from "../../hooks/authenticate.ts";

export const status2faRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/2fa/status",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Auth / 2FA"],
        summary: "Verificar status do 2FA",
        description: "Retorna se o 2FA está ativo para o usuário logado.",
        response: {
          200: z.object({
            enabled: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { twoFactorEnabled: true },
      });

      return reply.status(200).send({
        enabled: user?.twoFactorEnabled ?? false,
      });
    },
  );
};
