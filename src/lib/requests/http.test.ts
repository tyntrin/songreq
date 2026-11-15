import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/validation/text";
import { BlockedError, ClosedError, NotFoundError, RateLimitError, UnavailableSongsError } from "./errors";
import { keepAttemptAfter } from "./attempt";
import { MAX_BODY_BYTES, clientIp, mapErrorToResponse, readJsonBody } from "./http";

async function r(e: unknown) {
  const res = mapErrorToResponse(e);
  return [res.status, await res.json()];
}

describe("mapErrorToResponse", () => {
  it("maps each error", async () => {
    expect((await r(new NotFoundError()))[0]).toBe(404);
    expect(await r(new ClosedError())).toEqual([409, { error: "closed" }]);
    expect(await r(new BlockedError())).toEqual([403, { error: "blocked" }]);
    expect((await r(new RateLimitError()))[0]).toBe(429);
    expect(await r(new UnavailableSongsError(["a"]))).toEqual([
      409,
      { error: "unavailable", unavailableSongIds: ["a"] },
    ]);
    expect(await r(new ValidationError("name"))).toEqual([400, { error: "invalid", field: "name" }]);
  });
  it("rethrows unknown", () => {
    expect(() => mapErrorToResponse(new Error("x"))).toThrow("x");
  });
});

describe("clientIp", () => {
  it("prefers cf, then xff first, then unknown", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("readJsonBody", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request("http://x.test/", { method: "POST", body, headers, duplex: "half" } as RequestInit);
  const streamOf = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        const bytes = new TextEncoder().encode(text);
        for (let i = 0; i < bytes.length; i += 1000) c.enqueue(bytes.slice(i, i + 1000));
        c.close();
      },
    });

  it("parses a small JSON body", async () => {
    expect(await readJsonBody(post(JSON.stringify({ a: 1 })))).toEqual({ ok: true, body: { a: 1 } });
  });
  it("rejects a declared content-length over the cap with 413", async () => {
    const r = await readJsonBody(post("{}", { "content-length": String(MAX_BODY_BYTES + 1) }));
    expect(r).toEqual({ ok: false, status: 413 });
  });
  it("caps reading when content-length is missing", async () => {
    const big = JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) });
    expect(await readJsonBody(post(streamOf(big)))).toEqual({ ok: false, status: 413 });
    expect(await readJsonBody(post(streamOf(JSON.stringify({ ok: 1 }))))).toEqual({ ok: true, body: { ok: 1 } });
  });
  it("invalid JSON is a 400", async () => {
    expect(await readJsonBody(post("{nope"))).toEqual({ ok: false, status: 400 });
  });
});

describe("keepAttemptAfter (customer retry idempotency)", () => {
  it("keeps the attempt id after network errors and 5xx, resets after success and 4xx", () => {
    expect(keepAttemptAfter("network")).toBe(true);
    expect(keepAttemptAfter(500)).toBe(true);
    expect(keepAttemptAfter(502)).toBe(true);
    expect(keepAttemptAfter(201)).toBe(false);
    expect(keepAttemptAfter(400)).toBe(false);
    expect(keepAttemptAfter(409)).toBe(false);
    expect(keepAttemptAfter(429)).toBe(false);
  });
});
