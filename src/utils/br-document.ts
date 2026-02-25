function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeDocument(value: string): string {
  return onlyDigits(String(value ?? ""));
}

export function isValidCPF(value: string): boolean {
  const cpf = normalizeDocument(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map((c) => Number(c));

  // d10
  {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
    const mod = sum % 11;
    const d10 = mod < 2 ? 0 : 11 - mod;
    if (digits[9] !== d10) return false;
  }

  // d11
  {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i);
    const mod = sum % 11;
    const d11 = mod < 2 ? 0 : 11 - mod;
    if (digits[10] !== d11) return false;
  }

  return true;
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split("").map((c) => Number(c));

  const calcDigit = (baseLen: number) => {
    const weights =
      baseLen === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < baseLen; i++) sum += digits[i] * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d13 = calcDigit(12);
  if (digits[12] !== d13) return false;

  const d14 = calcDigit(13);
  if (digits[13] !== d14) return false;

  return true;
}

export function getDocumentType(value: string): "CPF" | "CNPJ" | null {
  const doc = normalizeDocument(value);
  if (isValidCPF(doc)) return "CPF";
  if (isValidCNPJ(doc)) return "CNPJ";
  return null;
}

