import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { performerMembers, users } from "@/lib/db/schema";
import { ForbiddenError, InviteError } from "./errors";
import { createPerformer, listMyPerformers } from "./service";
import { acceptInvite, createInvite } from "./invites";

let db: Db;
let performerId: string;
const input = { displayName: "Band", promptpayType: "phone" as const, promptpayId: "0812345678" };

beforeEach(async () => {
  db = await createTestDb();
  for (const id of ["u1", "u2", "u3"]) await db.insert(users).values({ id, email: `${id}@x.test` });
  performerId = (await createPerformer(db, "u1", input)).performer.id;
});

describe("invites", () => {
  it("only owners create invites; token is 32 url-safe chars", async () => {
    const token = await createInvite(db, performerId, "u1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    await db.insert(performerMembers).values({ performerId, userId: "u2", role: "member" });
    await expect(createInvite(db, performerId, "u2")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accept adds member; same user again adds no duplicate", async () => {
    const token = await createInvite(db, performerId, "u1");
    expect(await acceptInvite(db, token, "u2")).toEqual({ performerId });
    expect((await listMyPerformers(db, "u2"))[0].role).toBe("member");
    expect(await acceptInvite(db, token, "u2")).toEqual({ performerId });
    const rows = await db.select().from(performerMembers).where(eq(performerMembers.userId, "u2"));
    expect(rows).toHaveLength(1);
  });

  it("used by someone else throws", async () => {
    const token = await createInvite(db, performerId, "u1");
    await acceptInvite(db, token, "u2");
    await expect(acceptInvite(db, token, "u3")).rejects.toBeInstanceOf(InviteError);
  });

  it("expired and unknown tokens throw", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const token = await createInvite(db, performerId, "u1", now);
    await expect(acceptInvite(db, token, "u2", new Date("2026-01-08T00:00:01Z"))).rejects.toBeInstanceOf(InviteError);
    await expect(acceptInvite(db, "nope", "u2")).rejects.toBeInstanceOf(InviteError);
    expect(await acceptInvite(db, token, "u2", new Date("2026-01-07T23:59:59Z"))).toEqual({ performerId });
  });

  it("owner accepting own invite is a no-op", async () => {
    const token = await createInvite(db, performerId, "u1");
    expect(await acceptInvite(db, token, "u1")).toEqual({ performerId });
    const rows = await db.select().from(performerMembers).where(eq(performerMembers.userId, "u1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("owner");
  });
});
