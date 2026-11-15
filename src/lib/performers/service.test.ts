import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { performerMembers, setlists, users } from "@/lib/db/schema";
import { ValidationError } from "@/lib/validation/text";
import { ForbiddenError } from "./errors";
import {
  createPerformer,
  generatePublicId,
  getCurrentPerformer,
  listMyPerformers,
  requireRole,
  updatePerformer,
} from "./service";

let db: Db;
const input = { displayName: "วงเพื่อนบ้าน", promptpayType: "phone" as const, promptpayId: "081-234-5678" };

async function mkUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@x.test` });
}

beforeEach(async () => {
  db = await createTestDb();
  await mkUser("u1");
  await mkUser("u2");
});

describe("performers service", () => {
  it("creates performer with owner role and default setlist", async () => {
    const { performer, defaultSetlistId } = await createPerformer(db, "u1", input);
    expect(performer.promptpayId).toBe("0812345678");
    expect(performer.slug).toMatch(/^p-[a-z0-9]{6}$/);
    const sl = await db.select().from(setlists).where(eq(setlists.performerId, performer.id));
    expect(sl).toHaveLength(1);
    expect(sl[0].id).toBe(defaultSetlistId);
    expect(sl[0].name).toBe("Setlist หลัก");
    expect(sl[0].publicId).toMatch(/^[a-z0-9]{10}$/);
    const mine = await listMyPerformers(db, "u1");
    expect(mine).toHaveLength(1);
    expect(mine[0].role).toBe("owner");
  });

  it("builds slug from ASCII names", async () => {
    const { performer } = await createPerformer(db, "u1", { ...input, displayName: "The Band!" });
    expect(performer.slug).toMatch(/^the-band-[a-z0-9]{4}$/);
  });

  it("rejects invalid input", async () => {
    await expect(createPerformer(db, "u1", { ...input, promptpayId: "123" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createPerformer(db, "u1", { ...input, displayName: "  " })).rejects.toBeInstanceOf(ValidationError);
    await expect(createPerformer(db, "u1", { ...input, displayName: "x".repeat(61) })).rejects.toBeInstanceOf(ValidationError);
    expect(await listMyPerformers(db, "u1")).toHaveLength(0);
  });

  it("member cannot change promptpay but can toggle accepting", async () => {
    const { performer } = await createPerformer(db, "u1", input);
    await db.insert(performerMembers).values({ performerId: performer.id, userId: "u2", role: "member" });
    await expect(
      updatePerformer(db, performer.id, "u2", { promptpayType: "phone", promptpayId: "0899999999" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await updatePerformer(db, performer.id, "u2", { acceptingRequests: false });
    const cur = await getCurrentPerformer(db, "u2");
    expect(cur?.acceptingRequests).toBe(false);
    expect(cur?.role).toBe("member");
  });

  it("owner can update promptpay together; mismatched rejected", async () => {
    const { performer } = await createPerformer(db, "u1", input);
    await updatePerformer(db, performer.id, "u1", { promptpayType: "phone", promptpayId: "089-999-9999" });
    expect((await getCurrentPerformer(db, "u1"))?.promptpayId).toBe("0899999999");
    await expect(
      updatePerformer(db, performer.id, "u1", { promptpayType: "national_id", promptpayId: "0899999999" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(updatePerformer(db, performer.id, "u1", { promptpayId: "0899999999" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("requireRole throws for non-member and insufficient role", async () => {
    const { performer } = await createPerformer(db, "u1", input);
    await expect(requireRole(db, performer.id, "u2", "member")).rejects.toBeInstanceOf(ForbiddenError);
    await db.insert(performerMembers).values({ performerId: performer.id, userId: "u2", role: "member" });
    await expect(requireRole(db, performer.id, "u2", "owner")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await requireRole(db, performer.id, "u2", "member")).toBe("member");
    expect(await requireRole(db, performer.id, "u1", "owner")).toBe("owner");
  });

  it("getCurrentPerformer honours preferred id, else first, else null", async () => {
    expect(await getCurrentPerformer(db, "u1")).toBeNull();
    const a = await createPerformer(db, "u1", input);
    const b = await createPerformer(db, "u1", { ...input, displayName: "Two" });
    expect((await getCurrentPerformer(db, "u1"))?.id).toBe(a.performer.id);
    expect((await getCurrentPerformer(db, "u1", b.performer.id))?.id).toBe(b.performer.id);
    expect((await getCurrentPerformer(db, "u1", "nope"))?.id).toBe(a.performer.id);
    expect((await listMyPerformers(db, "u1")).map((p) => p.id)).toEqual([a.performer.id, b.performer.id]);
  });

  it("generatePublicId yields 10 chars [a-z0-9]", () => {
    expect(generatePublicId()).toMatch(/^[a-z0-9]{10}$/);
  });
});
