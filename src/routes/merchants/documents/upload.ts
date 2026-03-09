import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { createReadStream, readSync, openSync, closeSync } from "node:fs";
import { storageService } from "../../../services/storage.service.ts";
import { prisma } from "../../../lib/prisma.ts";
import { checkUserRequest } from "../../../utils/check-user-request.ts";
import { queueEmail } from "../../../lib/queues/email-queue.ts";
import { kycUnderReviewEmail } from "../../../lib/email-templates.ts";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf"]);
const ALLOWED_MIMETYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png": [[0x89, 0x50, 0x4E, 0x47]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
};

function validateMagicBytes(filepath: string, mimetype: string): boolean {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;

  const buf = Buffer.alloc(8);
  const fd = openSync(filepath, "r");
  try {
    readSync(fd, buf, 0, 8, 0);
  } finally {
    closeSync(fd);
  }

  return signatures.some((sig) =>
    sig.every((byte, i) => buf[i] === byte),
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

const CPF_FIELDS = ["docFront", "docBack", "docSelfie"];
const CNPJ_FIELDS = [
  ...CPF_FIELDS,
  "socialContract",
  "cnpjCard",
  "partnerDocFront",
  "partnerDocBack",
  "partnerDocSelfie",
];

const FIELD_TO_COLUMN: Record<string, string> = {
  docFront: "docFrontUrl",
  docBack: "docBackUrl",
  docSelfie: "docSelfieUrl",
  socialContract: "socialContractUrl",
  cnpjCard: "cnpjCardUrl",
  partnerDocFront: "partnerDocFrontUrl",
  partnerDocBack: "partnerDocBackUrl",
  partnerDocSelfie: "partnerDocSelfieUrl",
};

export const uploadDocumentsRoute: FastifyPluginAsyncZod = async (app) => {
  app.post("/", {
    schema: {
      tags: ["Merchants"],
      summary: "Upload documentos KYC",
      description: "Envia documentos para análise de compliance. CPF: frente, verso e selfie. CNPJ: contrato social, cartão CNPJ, frente/verso/selfie do sócio.",
      consumes: ["multipart/form-data"],
      response: {
        200: z.object({ message: z.string() }),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  }, async (request, reply) => {
    const { id: userId } = await checkUserRequest(request);

    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        email: true,
        kycStatus: true,
        documentType: true,
        partnerName: true,
        partnerDocument: true,
      },
    });
    if (!merchant) return reply.status(404).send({ message: "Merchant não encontrado" });

    if (merchant.kycStatus === "APPROVED") {
      return reply.status(400).send({ message: "Compliance já aprovado." });
    }

    const isCNPJ = merchant.documentType === "CNPJ";

    if (isCNPJ && (!merchant.partnerName || !merchant.partnerDocument)) {
      return reply.status(400).send({
        message: "Cadastre os dados do sócio antes de enviar os documentos (PATCH /merchants/me/partner).",
      });
    }

    const validFields = isCNPJ ? CNPJ_FIELDS : CPF_FIELDS;
    const files = await request.saveRequestFiles();

    if (files.length === 0) {
      return reply.status(400).send({ message: "Nenhum arquivo enviado." });
    }

    const updateData: Record<string, unknown> = { kycStatus: "UNDER_REVIEW" };
    const uploadedFields = new Set<string>();

    for (const file of files) {
      if (!validFields.includes(file.fieldname)) continue;

      const safeName = sanitizeFilename(file.filename ?? "file");
      const ext = (safeName.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return reply.status(400).send({ message: `Extensão não permitida: .${ext}. Use jpg, png ou pdf.` });
      }
      if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
        return reply.status(400).send({ message: `Tipo de arquivo não permitido: ${file.mimetype}` });
      }

      if (!validateMagicBytes(file.filepath, file.mimetype)) {
        return reply.status(400).send({
          message: `Arquivo "${file.fieldname}" não corresponde ao tipo declarado. Envie um arquivo válido.`,
        });
      }

      const fileName = `compliance/${merchant.id}/${file.fieldname}-${Date.now()}.${ext}`;
      const stream = createReadStream(file.filepath);
      await storageService.uploadFile(stream, fileName, file.mimetype);

      const column = FIELD_TO_COLUMN[file.fieldname];
      if (column) {
        updateData[column] = fileName;
        uploadedFields.add(file.fieldname);
      }
    }

    if (isCNPJ) {
      const required = ["socialContract", "cnpjCard", "partnerDocFront", "partnerDocBack", "partnerDocSelfie"];
      const missing = required.filter((f) => !uploadedFields.has(f));
      if (missing.length > 0) {
        return reply.status(400).send({
          message: `Documentos obrigatórios faltando para CNPJ: ${missing.join(", ")}`,
        });
      }
    }

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: updateData,
    });

    request.log.info({ merchantId: merchant.id, documentType: merchant.documentType }, "KYC documents uploaded");

    try {
      await queueEmail({ to: merchant.email, ...kycUnderReviewEmail(merchant.name) });
    } catch (emailErr: any) {
      request.log.warn({ error: emailErr?.message, merchantId: merchant.id }, "Failed to queue KYC under review email");
    }

    return reply.status(200).send({ message: "Documentos enviados para análise." });
  });
};
