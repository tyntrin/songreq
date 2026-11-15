import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "example.com", "x-forwarded-proto": "https" }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("getAppUrl", () => {
  it("uses APP_URL without trailing slash and does not warn", async () => {
    vi.stubEnv("APP_URL", "https://x.test/");
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getAppUrl } = await import("./app-url");
    expect(await getAppUrl()).toBe("https://x.test");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once in production when APP_URL is missing, then falls back to headers", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getAppUrl } = await import("./app-url");
    expect(await getAppUrl()).toBe("https://example.com");
    await getAppUrl();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn outside production", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getAppUrl } = await import("./app-url");
    await getAppUrl();
    expect(warn).not.toHaveBeenCalled();
  });
});
