export class ValidationError extends Error {
  field: string;
  constructor(field: string, message?: string) {
    super(message ?? `Invalid ${field}`);
    this.name = "ValidationError";
    this.field = field;
  }
}

/**
 * Strip control characters, trim; empty or non-string -> null.
 * Length is counted in code points. Throws ValidationError(field "text") if too long;
 * callers that know the field name re-map it.
 */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (cleaned === "") return null;
  if (Array.from(cleaned).length > max) {
    throw new ValidationError("text", `Text longer than ${max} characters`);
  }
  return cleaned;
}
