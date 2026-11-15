import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ execute }) }));

const { GET } = await import("./route");

afterEach(() => execute.mockReset());

describe("GET /api/health", () => {
  it("returns ok when the database answers", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("returns 503 when the database fails", async () => {
    execute.mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
