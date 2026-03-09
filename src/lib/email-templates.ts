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

export function sensitiveActionCodeEmail(code: string): { subject: string; html: string } {
  return {
    subject: "Código de verificação — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #111;">Verificação de segurança</h2>
        <p>Você solicitou acesso a uma informação sensível. Use o código abaixo para confirmar:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">Este código expira em <strong>15 minutos</strong>.</p>
        <p style="color: #666; font-size: 14px;">Se você não fez esta solicitação, altere sua senha imediatamente.</p>
      </div>
    `,
  };
}

export function merchantApprovedEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Sua conta foi aprovada! — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
        <h2 style="color: #111; margin-bottom: 8px;">Parabéns, sua conta foi aprovada! 🎉</h2>
        <p style="color: #444; margin-bottom: 24px;">Olá <strong>${name}</strong>,</p>
        <p style="color: #444;">Sua análise KYC foi concluída e sua conta na <strong>Liquera</strong> está pronta para uso.</p>
        <p style="color: #444;">Agora você pode acessar o painel e cadastrar sua chave PIX para começar a receber pagamentos.</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #18181b;">
          <p style="margin: 0; font-size: 14px; color: #444;">Próximos passos:</p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #444;">
            <li>Acesse o painel da Liquera</li>
            <li>Vá em <strong>Meu Perfil</strong> e cadastre sua chave PIX</li>
            <li>Comece a criar cobranças PIX</li>
          </ul>
        </div>
        <p style="color: #666; font-size: 13px; margin-top: 32px;">Se tiver dúvidas, entre em contato com nosso suporte.</p>
        <p style="color: #666; font-size: 13px;">— Equipe Liquera</p>
      </div>
    `,
  };
}

export function chargePaidEmail(data: {
  merchantName: string;
  amount: number;
  payerName?: string;
  chargeId: string;
}): { subject: string; html: string } {
  const value = (data.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return {
    subject: `Novo pagamento recebido: ${value} — Liquera`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
        <h2 style="color: #111; margin-bottom: 8px;">Você recebeu um pagamento! 💰</h2>
        <p style="color: #444; margin-bottom: 24px;">Olá <strong>${data.merchantName}</strong>,</p>
        <p style="color: #444;">Um pagamento PIX foi confirmado para sua conta.</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; margin: 24px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #666; font-size: 14px;">Valor recebido</span>
            <span style="font-size: 22px; font-weight: bold; color: #111;">${value}</span>
          </div>
          ${data.payerName ? `
          <div style="border-top: 1px solid #e4e4e7; padding-top: 12px; margin-top: 12px;">
            <span style="color: #666; font-size: 13px;">Pagador: </span>
            <span style="font-size: 13px; color: #111;">${data.payerName}</span>
          </div>
          ` : ""}
          <div style="border-top: 1px solid #e4e4e7; padding-top: 12px; margin-top: 12px;">
            <span style="color: #666; font-size: 13px;">ID da cobrança: </span>
            <span style="font-family: monospace; font-size: 12px; color: #444;">${data.chargeId}</span>
          </div>
        </div>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">
          O valor será liquidado e ficará disponível para saque em breve.
        </p>
        <p style="color: #666; font-size: 13px;">— Equipe Liquera</p>
      </div>
    `,
  };
}

export function emailVerifiedConfirmation(): { subject: string; html: string } {
  return {
    subject: "Email confirmado com sucesso! — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
        <h2 style="color: #111; margin-bottom: 8px;">Email confirmado!</h2>
        <p style="color: #444;">Seu email foi verificado com sucesso na <strong>Liquera</strong>.</p>
        <p style="color: #444;">Agora você pode prosseguir com o cadastro da sua empresa e enviar os documentos para análise KYC.</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #18181b;">
          <p style="margin: 0; font-size: 14px; color: #444;">Próximo passo:</p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #444;">
            <li>Acesse o painel e complete o cadastro da sua empresa</li>
            <li>Envie os documentos para verificação</li>
          </ul>
        </div>
        <p style="color: #666; font-size: 13px;">— Equipe Liquera</p>
      </div>
    `,
  };
}

export function kycUnderReviewEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Documentos recebidos — Em análise — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
        <h2 style="color: #111; margin-bottom: 8px;">Documentos recebidos!</h2>
        <p style="color: #444; margin-bottom: 24px;">Olá <strong>${name}</strong>,</p>
        <p style="color: #444;">Seus documentos foram recebidos e estão sendo analisados pela nossa equipe de compliance.</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px; color: #444;">
            <strong>Status:</strong> Em análise
          </p>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #444;">
            O prazo de análise é de até <strong>2 dias úteis</strong>. Você receberá um email quando a análise for concluída.
          </p>
        </div>
        <p style="color: #666; font-size: 13px;">Se tiver dúvidas, entre em contato com nosso suporte.</p>
        <p style="color: #666; font-size: 13px;">— Equipe Liquera</p>
      </div>
    `,
  };
}

export function merchantRejectedEmail(name: string, reason: string): { subject: string; html: string } {
  return {
    subject: "Documentos recusados — Liquera",
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
        <h2 style="color: #111; margin-bottom: 8px;">Documentos recusados</h2>
        <p style="color: #444; margin-bottom: 24px;">Olá <strong>${name}</strong>,</p>
        <p style="color: #444;">Infelizmente, seus documentos não foram aprovados na análise KYC.</p>
        <div style="background: #fef2f2; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #ef4444;">
          <p style="margin: 0; font-size: 14px; color: #444;">
            <strong>Motivo:</strong> ${reason}
          </p>
        </div>
        <p style="color: #444;">Você pode enviar novos documentos acessando o painel da Liquera e corrigindo os pontos mencionados acima.</p>
        <p style="color: #666; font-size: 13px; margin-top: 32px;">Se tiver dúvidas, entre em contato com nosso suporte.</p>
        <p style="color: #666; font-size: 13px;">— Equipe Liquera</p>
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
