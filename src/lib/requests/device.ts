import { cookies } from "next/headers";

export const DEVICE_COOKIE = "sr_device";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only: safe in server components. */
export async function readDeviceId(): Promise<string | null> {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}

/** Route handlers / server actions only (sets a cookie when missing). */
export async function getOrSetDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  const id = crypto.randomUUID();
  store.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
