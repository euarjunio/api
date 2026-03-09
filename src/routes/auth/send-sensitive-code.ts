import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { verifyJwt } from "../hooks/verify-jwt.ts";
import { checkUserRequest } from "../../utils/check-user-request.ts";
import { prisma } from "../../lib/prisma.ts";
import {
  createVerificationCode,
  checkCooldown,
} from "../../lib/verification-code.ts";
import { queueEmail } from "../../lib/queues/email-queue.ts";
import { sensitiveActionCodeEmail } from "../../lib/email-templates.ts";

export const sendSensitiveCodeRoute: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", verifyJwt).post("/send-sensitive-code", {
    schema: {
      tags: ["Auth"],
      summary: "Enviar código para ação sensível",
      description:
        "Envia um código de verificação por email para confirmar ações sensíveis (ex: visualizar API key, webhook secret)",
      response: {
        200: z.object({ message: z.string() }),
        429: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return reply.status(404).send({ message: "Usuário não encontrado" });
    }

    const canSend = await checkCooldown(userId, "SENSITIVE_ACTION");
    if (!canSend) {
      return reply.status(429).send({
        message: "Aguarde antes de solicitar um novo código",
      });
    }

    const code = await createVerificationCode(userId, "SENSITIVE_ACTION");
    const template = sensitiveActionCodeEmail(code);

    await queueEmail({
      to: user.email,
      subject: template.subject,
      html: template.html,
    });

    request.log.info({ userId }, "Sensitive action verification code sent");

    return reply.status(200).send({
      message: "Código de verificação enviado para seu email",
    });
  });
};
