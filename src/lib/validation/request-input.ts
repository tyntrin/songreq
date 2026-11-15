import { z } from "zod";
import { cleanText, ValidationError } from "./text";

function textField(field: string, max: number) {
  return z.unknown().optional().transform((raw, ctx): string | null => {
    try {
      return cleanText(raw, max);
    } catch (e) {
      if (e instanceof ValidationError) {
        ctx.issues.push({ code: "custom", message: e.message, input: raw });
        return z.NEVER;
      }
      throw e;
    }
  }).describe(field);
}

export const requestInputSchema = z.object({
  clientRequestId: z.uuid(),
  songIds: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate songIds" }),
  name: textField("name", 40),
  message: textField("message", 140),
  tipAmount: z.number().int().min(0).max(10000),
});

export type RequestInput = {
  clientRequestId: string;
  songIds: string[];
  name: string | null;
  message: string | null;
  tipAmount: number;
};

export function parseRequestInput(body: unknown): RequestInput {
  const result = requestInputSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length > 0 ? String(issue.path[0]) : "body";
    throw new ValidationError(field, issue.message);
  }
  return result.data;
}
