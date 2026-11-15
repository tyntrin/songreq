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
