import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { requests, setlists, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { purgeOldPii } from "./purge";

let db: Db;
const now = new Date("2026-11-16T00:00:00Z");
const day = 86_400_000;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(users).values({ id: "u1", email: "u1@x.test" });
});

describe("purgeOldPii", () => {
  it("nulls name and message only on requests older than 90 days", async () => {
    const { performer, defaultSetlistId } = await createPerformer(db, "u1", {
      displayName: "Band",
      promptpayType: "phone",
      promptpayId: "0812345678",
    });
    void setlists;
    const mk = (cid: string, ageDays: number) =>
      db.insert(requests).values({
        setlistId: defaultSetlistId,
        performerId: performer.id,
        deviceId: "d",
        clientRequestId: cid,
        requesterName: "Somchai",
        message: "hi",
        createdAt: new Date(now.getTime() - ageDays * day),
      });
    await mk("old", 91);
    await mk("edge", 89);
    await mk("new", 1);
    expect(await purgeOldPii(db, now)).toBe(1);
    const rows = await db.select().from(requests);
    const by = (c: string) => rows.find((r) => r.clientRequestId === c)!;
    expect(by("old").requesterName).toBeNull();
    expect(by("old").message).toBeNull();
    expect(by("edge").requesterName).toBe("Somchai");
    expect(by("new").message).toBe("hi");
    expect(await purgeOldPii(db, now)).toBe(0);
    void eq;
  });
});
