import generatePayload from "promptpay-qr";

export type PromptPayType = "phone" | "national_id";

export function normalizePromptPayId(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function isValidPromptPay(type: PromptPayType, id: string): boolean {
  const v = normalizePromptPayId(id);
  if (type === "phone") return /^0\d{9}$/.test(v);
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(v[12]);
}

/** Tip amounts are integer baht 1..10000 (0 = no tip, never a QR). */
export function buildPromptPayPayload(
  type: PromptPayType,
  id: string,
  amountBaht: number,
): string {
  if (!isValidPromptPay(type, id)) throw new Error("Invalid PromptPay id");
  if (!Number.isInteger(amountBaht) || amountBaht < 1 || amountBaht > 10000) {
    throw new Error("Invalid amount");
  }
  return generatePayload(normalizePromptPayId(id), { amount: amountBaht });
}

export function maskPromptPay(type: PromptPayType, id: string): string {
  const v = normalizePromptPayId(id);
  if (type === "phone") return `xxx-xxx-${v.slice(-4)}`;
  return `x-xxxx-xxxx${v[9]}-${v.slice(10, 12)}-${v[12]}`;
}
