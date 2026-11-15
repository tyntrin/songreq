import { headers } from "next/headers";

let warnedMissing = false;

/** Public base URL: APP_URL env, else request headers, else localhost dev. No trailing slash. */
export async function getAppUrl(): Promise<string> {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" && !warnedMissing) {
    warnedMissing = true;
    console.warn("APP_URL is not set in production; falling back to request headers for QR/poster/invite URLs");
  }
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // outside a request scope
  }
  return "http://localhost:3200";
}
