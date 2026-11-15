import { describe, expect, it } from "vitest";
import { en, pickLocale, t, th } from "./customer";

describe("pickLocale", () => {
  it("uses Accept-Language when no cookie", () => {
    expect(pickLocale(undefined, "en-US,en;q=0.9")).toBe("en");
  });
  it("cookie wins over header", () => {
    expect(pickLocale("th", "en-US")).toBe("th");
    expect(pickLocale("en", "th-TH")).toBe("en");
  });
  it("defaults to th", () => {
    expect(pickLocale(undefined, null)).toBe("th");
    expect(pickLocale("xx", "fr-FR")).toBe("th");
  });
  it("th first in header stays th", () => {
    expect(pickLocale(undefined, "th-TH,th;q=0.9,en;q=0.8")).toBe("th");
  });
});

describe("dictionaries", () => {
  it("every th key exists in en and vice versa", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort());
  });
  it("interpolates vars", () => {
    expect(t("en", "selectedCount", { n: 2 })).toContain("2");
    expect(t("th", "selectedCount", { n: 2 })).toContain("2");
  });
});
