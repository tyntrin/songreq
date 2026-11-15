import { describe, expect, it } from "vitest";
import { posterLayout, publicSetlistUrl, POSTER_H, POSTER_W } from "./qr-poster-lib";

describe("publicSetlistUrl", () => {
  it("joins without double slash", () => {
    expect(publicSetlistUrl("https://x.app/", "abc")).toBe("https://x.app/r/abc");
    expect(publicSetlistUrl("https://x.app", "abc")).toBe("https://x.app/r/abc");
    expect(publicSetlistUrl("https://x.app//", "abc")).toBe("https://x.app/r/abc");
  });
});

describe("posterLayout", () => {
  it("is A5 at 300dpi and keeps the QR square, centered and inside the page", () => {
    const l = posterLayout();
    expect([POSTER_W, POSTER_H]).toEqual([1748, 2480]);
    expect(l.qrBox.size).toBeGreaterThan(900);
    expect(l.qrBox.x * 2 + l.qrBox.size).toBe(POSTER_W);
    expect(l.qrBox.y + l.qrBox.size).toBeLessThan(l.nameY);
    expect(l.headingY).toBeLessThan(l.qrBox.y);
    expect(l.nameY).toBeLessThan(l.footerY);
    expect(l.footerY).toBeLessThan(POSTER_H);
  });
});
