import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { registerRoute } from "./register.ts";
import { loginRoute } from "./login.ts";
import { verifyEmailRoute } from "./verify-email.ts";
import { resendVerificationRoute } from "./resend-verification.ts";
import { forgotPasswordRoute } from "./forgot-password.ts";
import { resetPasswordRoute } from "./reset-password.ts";
import { changePasswordRoute } from "./change-password.ts";
import { setup2faRoute } from "./two-factor/setup.ts";
import { enable2faRoute } from "./two-factor/enable.ts";
import { disable2faRoute } from "./two-factor/disable.ts";
import { verify2faRoute } from "./two-factor/verify.ts";
import { status2faRoute } from "./two-factor/status.ts";

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.register(registerRoute);
  app.register(loginRoute);
  app.register(verifyEmailRoute);
  app.register(resendVerificationRoute);
  app.register(forgotPasswordRoute);
  app.register(resetPasswordRoute);
  app.register(changePasswordRoute);
  app.register(setup2faRoute);
  app.register(enable2faRoute);
  app.register(disable2faRoute);
  app.register(verify2faRoute);
  app.register(status2faRoute);
};
