import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/validation/text";
import {
  BlockedError,
  ClosedError,
  NotFoundError,
  RateLimitError,
  UnavailableSongsError,
} from "./errors";

/** Client IP: cf-connecting-ip, else first x-forwarded-for, else "unknown". */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || "unknown";
}

/** Largest anonymous request body we read (a full 10-song request is well under 2 KB). */
export const MAX_BODY_BYTES = 8192;

/**
 * Reads a JSON body of at most `max` bytes: 413 when content-length says more or the stream turns
 * out longer (reading stops at the cap), 400 when it isn't JSON.
 */
export async function readJsonBody(
  req: Request,
  max = MAX_BODY_BYTES,
): Promise<{ ok: true; body: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return { ok: false, status: 413 };
  if (!req.body) return { ok: false, status: 400 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** Maps a known request error to a response; rethrows unknown errors. */
export function mapErrorToResponse(err: unknown): NextResponse {
  if (err instanceof NotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (err instanceof ClosedError) return NextResponse.json({ error: "closed" }, { status: 409 });
  if (err instanceof BlockedError) return NextResponse.json({ error: "blocked" }, { status: 403 });
  if (err instanceof RateLimitError) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  if (err instanceof UnavailableSongsError) {
    return NextResponse.json(
      { error: "unavailable", unavailableSongIds: err.unavailableSongIds },
      { status: 409 },
    );
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: "invalid", field: err.field }, { status: 400 });
  }
  throw err;
}
