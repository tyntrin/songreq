import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/validation/text";
import { BlockedError, ClosedError, NotFoundError, RateLimitError, UnavailableSongsError } from "./errors";
import { clientIp, mapErrorToResponse } from "./http";

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
