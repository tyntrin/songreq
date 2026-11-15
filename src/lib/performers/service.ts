import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { performerMembers, performers, setlists, users } from "@/lib/db/schema";
import {
  isValidPromptPay,
  normalizePromptPayId,
  type PromptPayType,
} from "@/lib/promptpay/promptpay";
import { ValidationError, cleanText } from "@/lib/validation/text";
import { ForbiddenError } from "./errors";

export type Role = "owner" | "member";

export type Performer = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  promptpayType: PromptPayType;
  promptpayId: string;
  acceptingRequests: boolean;
  suspendedAt: Date | null;
};

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  // 256 is not a multiple of 36; the modulo bias is negligible for ids of this kind.
  return Array.from(bytes, (b) => ALNUM[b % ALNUM.length]).join("");
}

/** 10 chars [a-z0-9] from crypto.getRandomValues (setlist public ids). */
export function generatePublicId(): string {
  return randomChars(10);
}

function makeSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii ? `${ascii.slice(0, 40)}-${randomChars(4)}` : `p-${randomChars(6)}`;
}

export function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function validName(raw: unknown): string {
  let name: string | null;
  try {
    name = cleanText(raw, 60);
  } catch {
    throw new ValidationError("displayName", "Name too long");
  }
  if (!name) throw new ValidationError("displayName", "Name required");
  return name;
}

function validPromptPay(type: PromptPayType, id: string): string {
  if (!isValidPromptPay(type, id)) throw new ValidationError("promptpayId", "Invalid PromptPay");
  return normalizePromptPayId(id);
}

const performerCols = {
  id: performers.id,
  slug: performers.slug,
  displayName: performers.displayName,
  avatarUrl: performers.avatarUrl,
  promptpayType: performers.promptpayType,
  promptpayId: performers.promptpayId,
  acceptingRequests: performers.acceptingRequests,
  suspendedAt: performers.suspendedAt,
};

type Row = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  promptpayType: PromptPayType | null;
  promptpayId: string | null;
  acceptingRequests: boolean;
  suspendedAt: Date | null;
};

function toPerformer(r: Row): Performer {
  return { ...r, promptpayType: r.promptpayType as PromptPayType, promptpayId: r.promptpayId as string };
}

export async function createPerformer(
  db: Db,
  userId: string,
  input: {
    displayName: string;
    promptpayType: PromptPayType;
    promptpayId: string;
    avatarUrl?: string | null;
  },
): Promise<{ performer: Performer; defaultSetlistId: string }> {
  const displayName = validName(input.displayName);
  const promptpayId = validPromptPay(input.promptpayType, input.promptpayId);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(performers)
          .values({
            slug: makeSlug(displayName),
            displayName,
            avatarUrl: input.avatarUrl ?? null,
            promptpayType: input.promptpayType,
            promptpayId,
          })
          .returning(performerCols);
        await tx
          .insert(performerMembers)
          .values({ performerId: row.id, userId, role: "owner" });
        const [sl] = await tx
          .insert(setlists)
          .values({ performerId: row.id, name: "Setlist หลัก", publicId: generatePublicId() })
          .returning({ id: setlists.id });
        return { performer: toPerformer(row), defaultSetlistId: sl.id };
      });
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

export async function listMyPerformers(
  db: Db,
  userId: string,
): Promise<Array<Performer & { role: Role }>> {
  const rows = await db
    .select({ ...performerCols, role: performerMembers.role })
    .from(performerMembers)
    .innerJoin(performers, eq(performers.id, performerMembers.performerId))
    .where(eq(performerMembers.userId, userId))
    // membership has no created_at; performer creation order (then id) is a stable oldest-first proxy.
    .orderBy(asc(performers.createdAt), asc(performers.id));
  return rows.map((r) => ({ ...toPerformer(r), role: r.role }));
}

export async function getCurrentPerformer(
  db: Db,
  userId: string,
  preferredId?: string,
): Promise<(Performer & { role: Role }) | null> {
  const mine = await listMyPerformers(db, userId);
  if (mine.length === 0) return null;
  return mine.find((p) => p.id === preferredId) ?? mine[0];
}

export async function requireRole(
  db: Db,
  performerId: string,
  userId: string,
  need: Role,
): Promise<Role> {
  const [m] = await db
    .select({ role: performerMembers.role })
    .from(performerMembers)
    .where(and(eq(performerMembers.performerId, performerId), eq(performerMembers.userId, userId)));
  if (!m) throw new ForbiddenError();
  if (need === "owner" && m.role !== "owner") throw new ForbiddenError();
  return m.role;
}

export async function updatePerformer(
  db: Db,
  performerId: string,
  userId: string,
  patch: Partial<{
    displayName: string;
    avatarUrl: string | null;
    promptpayType: PromptPayType;
    promptpayId: string;
    acceptingRequests: boolean;
  }>,
): Promise<void> {
  const touchesPromptPay = patch.promptpayType !== undefined || patch.promptpayId !== undefined;
  await requireRole(db, performerId, userId, touchesPromptPay ? "owner" : "member");

  const set: Partial<typeof performers.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = validName(patch.displayName);
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl;
  if (patch.acceptingRequests !== undefined) set.acceptingRequests = patch.acceptingRequests;
  if (touchesPromptPay) {
    if (patch.promptpayType === undefined || patch.promptpayId === undefined) {
      throw new ValidationError("promptpayId", "PromptPay type and id must be set together");
    }
    set.promptpayType = patch.promptpayType;
    set.promptpayId = validPromptPay(patch.promptpayType, patch.promptpayId);
  }
  if (Object.keys(set).length === 0) return;
  await db.update(performers).set(set).where(eq(performers.id, performerId));
}

/** Owner-only. An owner (including the caller) cannot be removed. */
export async function removeMember(
  db: Db,
  performerId: string,
  userId: string,
  memberUserId: string,
): Promise<void> {
  await requireRole(db, performerId, userId, "owner");
  const [target] = await db
    .select({ role: performerMembers.role })
    .from(performerMembers)
    .where(and(eq(performerMembers.performerId, performerId), eq(performerMembers.userId, memberUserId)));
  if (!target) return;
  if (target.role === "owner") throw new ForbiddenError("Cannot remove an owner");
  await db
    .delete(performerMembers)
    .where(and(eq(performerMembers.performerId, performerId), eq(performerMembers.userId, memberUserId)));
}

export async function listMembers(
  db: Db,
  performerId: string,
): Promise<Array<{ userId: string; name: string; role: Role }>> {
  const rows = await db
    .select({
      userId: performerMembers.userId,
      name: users.name,
      email: users.email,
      role: performerMembers.role,
    })
    .from(performerMembers)
    .innerJoin(users, eq(users.id, performerMembers.userId))
    .where(eq(performerMembers.performerId, performerId))
    .orderBy(sql`case when ${performerMembers.role} = 'owner' then 0 else 1 end`, asc(users.name));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name || r.email?.split("@")[0] || "ไม่ระบุชื่อ",
    role: r.role,
  }));
}
