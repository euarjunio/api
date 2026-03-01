import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyAdmin } from "../../hooks/verify-admin.ts";

import { listMerchantsRoute } from "./list.ts";
import { getMerchantDetailRoute } from "./get-detail.ts";
import { listPendingKycRoute } from "./list-pending.ts";
import { approveMerchantRoute } from "./approve.ts";
import { rejectMerchantRoute } from "./reject.ts";
import { setFeeRoute } from "./set-fee.ts";
import { setupAcquirerRoute } from "./setup-acquirer.ts";
import { blockMerchantRoute } from "./block.ts";
import { unblockMerchantRoute } from "./unblock.ts";
import { acquirerBalanceRoute } from "./acquirer-balance.ts";
import { adminDisable2faRoute } from "./disable-2fa.ts";

export const adminMerchantsRoutes: FastifyPluginAsyncZod = async (app) => {
  // Todas as rotas de admin exigem ADMIN
  app.addHook("onRequest", verifyAdmin);

  // GET    /v1/admin/merchants
  app.register(listMerchantsRoute);

  // GET    /v1/admin/merchants/pending-kyc
  app.register(listPendingKycRoute);

  // GET    /v1/admin/merchants/:id
  app.register(getMerchantDetailRoute);

  // POST   /v1/admin/merchants/:id/approve
  app.register(approveMerchantRoute);

  // POST   /v1/admin/merchants/:id/reject
  app.register(rejectMerchantRoute);

  // POST   /v1/admin/merchants/:id/set-fee
  app.register(setFeeRoute);

  // POST   /v1/admin/merchants/:id/setup-acquirer
  app.register(setupAcquirerRoute);

  // POST   /v1/admin/merchants/:id/block
  app.register(blockMerchantRoute);

  // POST   /v1/admin/merchants/:id/unblock
  app.register(unblockMerchantRoute);

  // GET    /v1/admin/merchants/:id/acquirer-balance
  app.register(acquirerBalanceRoute);

  // POST   /v1/admin/merchants/:id/disable-2fa
  app.register(adminDisable2faRoute);
};
