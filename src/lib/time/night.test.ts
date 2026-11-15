import { describe, expect, it } from "vitest";
import { nightKey, nightRange, periodRange } from "./night";

const at = new Date("2026-11-20T18:30:00Z");

describe("night", () => {
  it("nightKey", () => {
    expect(nightKey(at)).toBe("2026-11-20");
    expect(nightKey(new Date("2026-11-20T23:00:00Z"))).toBe("2026-11-21");
    expect(nightKey(new Date("2026-11-20T22:59:59Z"))).toBe("2026-11-20");
  });
  it("nightRange", () => {
    const r = nightRange(at);
    expect(r.start.toISOString()).toBe("2026-11-19T23:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-11-20T23:00:00.000Z");
  });
  it("periodRange", () => {
    expect(periodRange("night", at)).toEqual(nightRange(at));
    const w = periodRange("week", at);
    expect(w.start.toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-20T23:00:00.000Z");
    const m = periodRange("month", at);
    expect(m.start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(m.end.toISOString()).toBe("2026-11-20T23:00:00.000Z");
  });
});
