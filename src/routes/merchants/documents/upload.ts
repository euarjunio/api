import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { storageService } from "../../../services/storage.service.ts";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";

export const uploadDocumentsRoute: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/merchants/me/documents
  app.post("/", {
    schema: {
      tags: ["Merchants"],
      summary: "Upload documentos KYC",
      description: "Envia frente, verso e selfie com documento para análise de compliance",
      consumes: ["multipart/form-data"],
      response: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({ where: { userId } });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    if (merchant.kycStatus === "APPROVED") {
      return reply.status(400).send({ message: "Compliance já aprovado." });
    }

    const files = await request.saveRequestFiles();

    if (files.length === 0) {
      return reply.status(400).send({ message: "Nenhum arquivo enviado." });
    }

    const validFields = ["docFront", "docBack", "docSelfie"];
    const updateData: any = { kycStatus: "UNDER_REVIEW" };

    for (const file of files) {
      if (!validFields.includes(file.fieldname)) continue;

      const ext = file.filename?.split(".").pop() ?? "jpg";
      const fileName = `compliance/${merchant.id}/${file.fieldname}-${Date.now()}.${ext}`;
      const fileBuffer = await readFile(file.filepath);

      await storageService.uploadFile(fileBuffer, fileName, file.mimetype);

      if (file.fieldname === "docFront") updateData.docFrontUrl = fileName;
      if (file.fieldname === "docBack") updateData.docBackUrl = fileName;
      if (file.fieldname === "docSelfie") updateData.docSelfieUrl = fileName;
    }

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: updateData,
    });

    request.log.info({ merchantId: merchant.id }, "KYC documents uploaded");

    return reply.status(200).send({ message: "Documentos enviados para análise." });
  });
};
