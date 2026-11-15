import { describe, expect, it } from "vitest";
import { isAdminEmail } from "./admin";

const env = (v?: string) => ({ ADMIN_EMAILS: v }) as unknown as NodeJS.ProcessEnv;

describe("isAdminEmail", () => {
  it("matches case-insensitively with trimmed list", () => {
    expect(isAdminEmail("A@x.com", env(" a@x.com, b@y.com"))).toBe(true);
    expect(isAdminEmail("b@y.com", env(" a@x.com, b@y.com"))).toBe(true);
  });
  it("false for null/undefined, non-members, empty env", () => {
    expect(isAdminEmail(null, env("a@x.com"))).toBe(false);
    expect(isAdminEmail(undefined, env("a@x.com"))).toBe(false);
    expect(isAdminEmail("c@z.com", env("a@x.com"))).toBe(false);
    expect(isAdminEmail("a@x.com", env(""))).toBe(false);
    expect(isAdminEmail("a@x.com", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});
