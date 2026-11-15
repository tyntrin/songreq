import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import * as s from "./schema";

async function seed() {
  const db = await createTestDb();
  const [user] = await db.insert(s.users).values({ email: "a@b.c" }).returning();
  const [performer] = await db
    .insert(s.performers)
    .values({ slug: "band", displayName: "Band", promptpayType: "phone", promptpayId: "0812345678" })
    .returning();
  await db.insert(s.performerMembers).values({ performerId: performer.id, userId: user.id, role: "owner" });
  const [song] = await db.insert(s.songs).values({ title: "T", artist: "A", source: "custom" }).returning();
  await db.insert(s.repertoire).values({ performerId: performer.id, songId: song.id, tags: ["rock"] });
  const [setlist] = await db
    .insert(s.setlists)
    .values({ performerId: performer.id, name: "Night", publicId: "abcdefghij" })
    .returning();
  await db.insert(s.setlistSongs).values({ setlistId: setlist.id, songId: song.id, position: 0 });
  const [request] = await db
    .insert(s.requests)
    .values({
      setlistId: setlist.id,
      performerId: performer.id,
      deviceId: "d1",
      clientRequestId: "c1",
      requesterName: "N",
      message: "hi",
    })
    .returning();
  await db.insert(s.requestItems).values({ requestId: request.id, songId: song.id });
  return { db, performer, song, setlist, request };
}

describe("schema", () => {
  it("migrations create all tables", async () => {
    const { db } = await seed();
    for (const t of [
      s.users, s.performers, s.performerMembers, s.songs, s.repertoire,
      s.setlists, s.setlistSongs, s.requests, s.requestItems,
    ]) {
      expect(await db.select().from(t)).toHaveLength(1);
    }
    const [rep] = await db.select().from(s.repertoire);
    expect(rep.tags).toEqual(["rock"]);
    const [req] = await db.select().from(s.requests);
    expect(req.tipAmount).toBe(0);
    expect(req.createdAt).toBeInstanceOf(Date);
  });

  it("repertoire is unique per performer and song", async () => {
    const { db, performer, song } = await seed();
    await expect(
      db.insert(s.repertoire).values({ performerId: performer.id, songId: song.id }),
    ).rejects.toThrow();
  });

  it("requests are idempotent per performer, device and client request id", async () => {
    const { db, performer, setlist } = await seed();
    await expect(
      db.insert(s.requests).values({
        setlistId: setlist.id, performerId: performer.id, deviceId: "d1", clientRequestId: "c1",
      }),
    ).rejects.toThrow();
  });
});
