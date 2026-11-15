import { cookies, headers } from "next/headers";
import { pickLocale, type Locale } from "./customer";

export async function getCustomerLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLocale(c.get("sr_lang")?.value, h.get("accept-language"));
}
