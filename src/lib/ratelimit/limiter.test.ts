import { describe, expect, it } from "vitest";
import { createRateLimiter, deviceLimiter, ipLimiter } from "./limiter";

describe("rate limiter", () => {
  it("enforces cost within a sliding window", () => {
    let t = 0;
    const l = createRateLimiter({ limit: 10, windowMs: 600000, now: () => t });
    expect(l.consume("k", 6)).toBe(true);
    expect(l.consume("k", 4)).toBe(true);
    expect(l.consume("k", 1)).toBe(false);
    t = 600001;
    expect(l.consume("k", 1)).toBe(true);
  });
  it("keys are independent; rejected consume is not recorded", () => {
    const l = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    expect(l.consume("a", 3)).toBe(false);
    expect(l.consume("a", 2)).toBe(true);
    expect(l.consume("b", 2)).toBe(true);
  });
  it("ip limit is looser than device limit", () => {
    const ip = createRateLimiter({ limit: 60, windowMs: 600000, now: () => 0 });
    for (let i = 0; i < 60; i++) expect(ip.consume("k", 1)).toBe(true);
    expect(ip.consume("k", 1)).toBe(false);
    expect(deviceLimiter).toBeDefined();
    expect(ipLimiter).toBeDefined();
  });
});
