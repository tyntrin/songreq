import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ValidationError } from "@/lib/validation/text";

export type Env = Record<string, string | undefined>;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const SAFE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function isSafeUploadName(name: string): boolean {
  return SAFE_NAME.test(name);
}

export function uploadDir(env: Env = process.env): string {
  return path.resolve(env.UPLOAD_DIR || "./.data/uploads");
}

/** Detect the real image type from magic bytes. */
function sniff(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP"
  )
    return "webp";
  return null;
}

export type StorageDriver = {
  name: "local" | "r2";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
};

function localDriver(env: Env): StorageDriver {
  return {
    name: "local",
    async put(key, bytes) {
      const dir = uploadDir(env);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, key), bytes);
      return `/api/uploads/${key}`;
    },
  };
}

function r2Driver(env: Env): StorageDriver {
  // Construction makes no network call.
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
  return {
    name: "r2",
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      return `${(env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "")}/${key}`;
    },
  };
}

export function getStorage(env: Env = process.env): StorageDriver {
  return env.STORAGE_DRIVER === "r2" ? r2Driver(env) : localDriver(env);
}

export async function saveAvatar(input: { bytes: Uint8Array; contentType: string }): Promise<string> {
  if (input.bytes.length === 0) throw new ValidationError("avatar", "Empty file");
  if (input.bytes.length > MAX_AVATAR_BYTES) throw new ValidationError("avatar", "File larger than 2 MB");
  if (!ALLOWED.has(input.contentType)) throw new ValidationError("avatar", "Unsupported image type");
  const ext = sniff(input.bytes);
  if (!ext) throw new ValidationError("avatar", "Not a valid image");
  return getStorage().put(`${randomUUID()}.${ext}`, input.bytes, CONTENT_TYPES[ext]);
}

/** True only for URLs this module could have produced (guards a client-supplied avatarUrl). */
export function isOwnAvatarUrl(url: string, env: Env = process.env): boolean {
  if (url.startsWith("/api/uploads/")) return isSafeUploadName(url.slice("/api/uploads/".length));
  const base = (env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  return env.STORAGE_DRIVER === "r2" && base !== "" && url.startsWith(`${base}/`) && isSafeUploadName(url.slice(base.length + 1));
}
