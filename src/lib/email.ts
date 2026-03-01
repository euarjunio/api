import nodemailer from "nodemailer";
import { env } from "../config/env.ts";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // true para 465 (SSL), false para 587 (TLS)
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function verifyEmailConnection() {
  try {
    await transporter.verify();
    console.log("✅ [EMAIL] SMTP connection verified");
  } catch (err) {
    console.error("❌ [EMAIL] SMTP connection failed:", err);
  }
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
