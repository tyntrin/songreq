import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getCurrentPerformer, type Performer, type Role } from "./service";

export const PERFORMER_COOKIE = "sr_performer";

export type CurrentContext = {
  user: { id: string; email: string | null; name: string | null };
  performer: Performer & { role: Role };
};

/** For pages, layouts and server actions: redirects to /login or /setup. */
export async function requireCurrentPerformer(): Promise<CurrentContext> {
  const user = await requireUser();
  const preferred = (await cookies()).get(PERFORMER_COOKIE)?.value;
  const performer = await getCurrentPerformer(getDb(), user.id, preferred);
  if (!performer) redirect("/setup");
  return { user, performer };
}

/** For API routes: null when signed out or the user has no performer (caller answers 401/403). */
export async function getCurrentPerformerOrNull(): Promise<
  { signedIn: false } | { signedIn: true; context: CurrentContext | null }
> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return { signedIn: false };
  const user = { id: u.id, email: u.email ?? null, name: u.name ?? null };
  const preferred = (await cookies()).get(PERFORMER_COOKIE)?.value;
  const performer = await getCurrentPerformer(getDb(), user.id, preferred);
  return { signedIn: true, context: performer ? { user, performer } : null };
}
