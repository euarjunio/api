export function verificationCodeEmail(code: string): { subject: string; html: string } {
  return {
    subject: "Confirme seu email — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #111;">Confirme seu email</h2>
        <p>Use o código abaixo para verificar sua conta:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">Este código expira em <strong>15 minutos</strong>.</p>
        <p style="color: #666; font-size: 14px;">Se você não criou uma conta, ignore este email.</p>
      </div>
    `,
  };
}

export function passwordResetEmail(code: string): { subject: string; html: string } {
  return {
    subject: "Redefinir senha — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #111;">Redefinir sua senha</h2>
        <p>Use o código abaixo para redefinir sua senha:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">Este código expira em <strong>15 minutos</strong>.</p>
        <p style="color: #666; font-size: 14px;">Se você não solicitou a redefinição, ignore este email.</p>
      </div>
    `,
  };
}
