import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/validation/text";
import { getStorage, isOwnAvatarUrl, isSafeUploadName, saveAvatar } from "./index";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "sr-up-"));
  process.env.UPLOAD_DIR = dir;
  delete process.env.STORAGE_DRIVER;
});
afterEach(() => {
  delete process.env.UPLOAD_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("saveAvatar", () => {
  it("rejects files over 2 MB", async () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    big.set(PNG);
    await expect(saveAvatar({ bytes: big, contentType: "image/png" })).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects image/gif", async () => {
    const gif = new TextEncoder().encode("GIF89a....");
    await expect(saveAvatar({ bytes: gif, contentType: "image/gif" })).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects a declared png whose bytes are not an image", async () => {
    const bytes = new TextEncoder().encode("<html>nope</html>");
    await expect(saveAvatar({ bytes, contentType: "image/png" })).rejects.toBeInstanceOf(ValidationError);
  });
  it("local driver writes the file and returns /api/uploads/<name>", async () => {
    const url = await saveAvatar({ bytes: PNG, contentType: "image/png" });
    expect(url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
    const name = url.split("/").pop()!;
    expect(isSafeUploadName(name)).toBe(true);
    expect(Array.from(readFileSync(path.join(dir, name)))).toEqual(Array.from(PNG));
  });
  it("sniffs the real type: jpeg bytes declared as png are stored as .jpg", async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(await saveAvatar({ bytes: jpg, contentType: "image/png" })).toMatch(/\.jpg$/);
  });
});

describe("driver selection", () => {
  it("defaults to local and selects r2 without network", () => {
    expect(getStorage({}).name).toBe("local");
    const r2 = getStorage({
      STORAGE_DRIVER: "r2",
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "k",
      R2_SECRET_ACCESS_KEY: "s",
      R2_BUCKET: "b",
      R2_PUBLIC_URL: "https://cdn.example.com/",
    });
    expect(r2.name).toBe("r2");
  });
  it("own-url check covers r2 keys", () => {
    const env = { STORAGE_DRIVER: "r2", R2_PUBLIC_URL: "https://cdn.x.com" };
    const ok = "11111111-1111-1111-1111-111111111111.png";
    expect(isOwnAvatarUrl(`https://cdn.x.com/${ok}`, env)).toBe(true);
    expect(isOwnAvatarUrl("https://cdn.x.com/evil.html", env)).toBe(false);
    expect(isOwnAvatarUrl("https://evil.com/" + ok, env)).toBe(false);
  });
  it("safe-name check", () => {
    expect(isSafeUploadName("../etc/passwd")).toBe(false);
    expect(isSafeUploadName("11111111-1111-1111-1111-111111111111.gif")).toBe(false);
    expect(isSafeUploadName("11111111-1111-1111-1111-111111111111.webp")).toBe(true);
  });
});
