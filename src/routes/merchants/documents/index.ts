import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { uploadDocumentsRoute } from "./upload.ts";
import { kycStatusRoute } from "./kyc-status.ts";

export const documentsRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/merchants/me/documents
  app.register(uploadDocumentsRoute);

  // GET /v1/merchants/me/documents/kyc-status
  app.register(kycStatusRoute);
};
