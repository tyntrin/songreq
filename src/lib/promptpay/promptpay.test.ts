import { describe, expect, it } from "vitest";
import {
  buildPromptPayPayload,
  isValidPromptPay,
  maskPromptPay,
  normalizePromptPayId,
} from "./promptpay";

describe("promptpay", () => {
  it("normalizes", () => {
    expect(normalizePromptPayId(" 081-234 5678 ")).toBe("0812345678");
  });
  it("validates phone", () => {
    expect(isValidPromptPay("phone", "081-234-5678")).toBe(true);
    expect(isValidPromptPay("phone", "812345678")).toBe(false);
    expect(isValidPromptPay("phone", "08123456789")).toBe(false);
  });
  it("validates national id checksum", () => {
    expect(isValidPromptPay("national_id", "1101700230708")).toBe(true);
    expect(isValidPromptPay("national_id", "1101700230705")).toBe(false);
  });
  it("builds payload", () => {
    const p = buildPromptPayPayload("phone", "0812345678", 50);
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("01130066812345678");
    expect(p).toContain("540550.00");
    expect(p).toMatch(/6304[0-9A-F]{4}$/);
    expect(buildPromptPayPayload("national_id", "1101700230708", 20)).toContain("02131101700230708");
  });
  it("rejects bad input", () => {
    expect(() => buildPromptPayPayload("phone", "123", 50)).toThrow();
    expect(() => buildPromptPayPayload("phone", "0812345678", 0)).toThrow();
    expect(() => buildPromptPayPayload("phone", "0812345678", 10001)).toThrow();
    expect(() => buildPromptPayPayload("phone", "0812345678", 1.5)).toThrow();
  });
  it("masks", () => {
    expect(maskPromptPay("phone", "0812345678")).toBe("xxx-xxx-5678");
    expect(maskPromptPay("national_id", "1101700230708")).toBe("x-xxxx-xxxx0-70-8");
  });
});
