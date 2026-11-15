import { describe, expect, it } from "vitest";
import { isDevLoginEnabled } from "./dev-login";

describe("isDevLoginEnabled", () => {
  it("true in development with flag", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("false in production even with flag", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("false when unset", () => {
    expect(isDevLoginEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
