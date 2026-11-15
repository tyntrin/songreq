import { headers } from "next/headers";

/** Public base URL: APP_URL env, else request headers, else localhost dev. No trailing slash. */
export async function getAppUrl(): Promise<string> {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
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
