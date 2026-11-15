import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { performerInvites, performerMembers } from "@/lib/db/schema";
import { InviteError } from "./errors";
import { requireRole } from "./service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url"); // 24 bytes -> 32 url-safe chars
}

export async function createInvite(
  db: Db,
  performerId: string,
  userId: string,
  now: Date = new Date(),
): Promise<string> {
  await requireRole(db, performerId, userId, "owner");
  const token = generateToken();
  await db.insert(performerInvites).values({
    token,
    performerId,
    createdBy: userId,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
  });
  return token;
}

export async function acceptInvite(
  db: Db,
  token: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ performerId: string }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(performerInvites).where(eq(performerInvites.token, token));
    if (!inv || inv.expiresAt < now) throw new InviteError();

    const [existing] = await tx
      .select({ id: performerMembers.id })
      .from(performerMembers)
      .where(and(eq(performerMembers.performerId, inv.performerId), eq(performerMembers.userId, userId)));
    if (existing) return { performerId: inv.performerId };

    // Atomic claim: only one accepter can flip used_at from null.
    const claimed = await tx
      .update(performerInvites)
      .set({ usedAt: now })
      .where(and(eq(performerInvites.id, inv.id), isNull(performerInvites.usedAt)))
      .returning({ id: performerInvites.id });
    if (claimed.length === 0) throw new InviteError();

    await tx
      .insert(performerMembers)
      .values({ performerId: inv.performerId, userId, role: "member" })
      .onConflictDoNothing();
    return { performerId: inv.performerId };
  });
}
