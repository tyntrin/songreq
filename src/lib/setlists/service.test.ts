import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { performers, requestItems, requests, setlistSongs, setlists, songs, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { ValidationError } from "@/lib/validation/text";
import { createRateLimiter } from "@/lib/ratelimit/limiter";
import { createRequest } from "@/lib/requests/service";
import { NotFoundError } from "@/lib/requests/errors";
import { getFeedPayload, getTonightFeed, hideItems } from "@/lib/requests/feed";
import { getStats } from "@/lib/stats/service";
import {
  createSetlist,
  deleteSetlist,
  getPublicSetlist,
  listSetlists,
  renameSetlist,
  setSetlistSongs,
} from "./service";

let db: Db;
let pid: string;
let defaultId: string;
let publicId: string;
let qid: string;
let qDefault: string;

async function mk(email: string, name: string) {
  await db.insert(users).values({ id: email, email });
  return createPerformer(db, email, { displayName: name, promptpayType: "phone", promptpayId: "0812345678" });
}

beforeEach(async () => {
  db = await createTestDb();
  const a = await mk("u1", "A");
  pid = a.performer.id;
  defaultId = a.defaultSetlistId;
  const b = await mk("u2", "B");
  qid = b.performer.id;
  qDefault = b.defaultSetlistId;
  const [sl] = await db.select().from(setlists).where(eq(setlists.id, defaultId));
  publicId = sl.publicId;
});

describe("setlists", () => {
  it("createSetlist makes 10-char publicId and validates name", async () => {
    const s = await createSetlist(db, pid, "  คืนวันศุกร์ ");
    expect(s.publicId).toMatch(/^[a-z0-9]{10}$/);
    expect(s.name).toBe("คืนวันศุกร์");
    await expect(createSetlist(db, pid, "")).rejects.toBeInstanceOf(ValidationError);
    await expect(createSetlist(db, pid, "x".repeat(41))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rename and delete are scoped to the performer", async () => {
    await renameSetlist(db, pid, defaultId, "ใหม่");
    expect((await db.select().from(setlists).where(eq(setlists.id, defaultId)))[0].name).toBe("ใหม่");
    await renameSetlist(db, qid, defaultId, "hacked");
    expect((await db.select().from(setlists).where(eq(setlists.id, defaultId)))[0].name).toBe("ใหม่");
    await createSetlist(db, qid, "second");
    await deleteSetlist(db, qid, defaultId);
    expect(await db.select().from(setlists).where(eq(setlists.id, defaultId))).toHaveLength(1);
  });

  it("cannot delete the last active setlist; delete archives (row and songs kept)", async () => {
    await expect(deleteSetlist(db, pid, defaultId)).rejects.toMatchObject({ field: "setlist" });
    const two = await createSetlist(db, pid, "two");
    const s1 = await addCustomSong(db, pid, "u1", { title: "B", artist: "x" });
    await deleteSetlist(db, pid, defaultId);
    const rows = await db.select().from(setlists).where(eq(setlists.performerId, pid));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === defaultId)!.archivedAt).not.toBeNull();
    expect(await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, defaultId))).toHaveLength(1);
    // the archived one no longer counts: "two" is now the last active setlist
    await expect(deleteSetlist(db, pid, two.id)).rejects.toMatchObject({ field: "setlist" });
    // deleting an already archived setlist is a no-op
    await deleteSetlist(db, pid, defaultId);
    void s1;
  });

  it("archived setlist: QR dead, hidden from lists, history and stats kept", async () => {
    const song = await addCustomSong(db, pid, "u1", { title: "B", artist: "x" });
    const now = new Date("2026-11-16T15:00:00Z");
    const limiters = () => ({
      device: createRateLimiter({ limit: 10, windowMs: 600000 }),
      ip: createRateLimiter({ limit: 60, windowMs: 600000 }),
    });
    const req = () =>
      createRequest(
        db,
        { publicId, deviceId: "d1", ip: "1.1.1.1", now, limiters: limiters() },
        { clientRequestId: crypto.randomUUID(), songIds: [song.songId], name: null, message: null, tipAmount: 0 },
      );
    await req();
    const two = await createSetlist(db, pid, "two");
    await deleteSetlist(db, pid, defaultId);

    expect(await getPublicSetlist(db, publicId)).toBeNull();
    await expect(req()).rejects.toBeInstanceOf(NotFoundError);
    expect((await listSetlists(db, pid, now)).map((l) => l.id)).toEqual([two.id]);
    expect((await getFeedPayload(db, pid, now)).setlists.map((l) => l.id)).toEqual([two.id]);
    // requests from the archived setlist still count tonight and in stats
    expect((await getTonightFeed(db, pid, now)).requestCount).toBe(1);
    const stats = await getStats(db, pid, "night", now);
    expect(stats.requestCount).toBe(1);
    expect(stats.bySetlist).toEqual([{ setlistId: defaultId, name: expect.any(String), count: 1 }]);
    // new repertoire songs go to the oldest *active* setlist
    const added = await addCustomSong(db, pid, "u1", { title: "C", artist: "x" });
    const inTwo = await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, two.id));
    expect(inTwo.map((r) => r.songId)).toEqual([added.songId]);
    const inOld = await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, defaultId));
    expect(inOld.map((r) => r.songId)).toEqual([song.songId]);
  });

  it("setSetlistSongs replaces in order, dedupes, rejects foreign songs", async () => {
    const s1 = await addCustomSong(db, pid, "u1", { title: "B", artist: "x" });
    const s2 = await addCustomSong(db, pid, "u1", { title: "A", artist: "x" });
    const other = await addCustomSong(db, qid, "u2", { title: "Z", artist: "x" });
    await setSetlistSongs(db, pid, defaultId, [s2.songId, s1.songId, s2.songId]);
    const rows = await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, defaultId));
    expect(rows.sort((a, b) => a.position - b.position).map((r) => [r.songId, r.position])).toEqual([
      [s2.songId, 0],
      [s1.songId, 1],
    ]);
    await expect(setSetlistSongs(db, pid, defaultId, [other.songId])).rejects.toBeInstanceOf(ValidationError);
    // other performer cannot touch it
    await setSetlistSongs(db, qid, defaultId, []);
    expect(await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, defaultId))).toHaveLength(2);
    await setSetlistSongs(db, pid, defaultId, []);
    expect(await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, defaultId))).toHaveLength(0);
    void qDefault;
  });

  it("listSetlists counts songs and tonight's visible request items (same as the monitor)", async () => {
    const s1 = await addCustomSong(db, pid, "u1", { title: "B", artist: "x" });
    const s2 = await addCustomSong(db, pid, "u1", { title: "C", artist: "x" });
    const now = new Date("2026-11-16T15:00:00Z");
    const [r1, r2, r3] = await db
      .insert(requests)
      .values([
        { setlistId: defaultId, performerId: pid, deviceId: "d", clientRequestId: "1", createdAt: now },
        { setlistId: defaultId, performerId: pid, deviceId: "d", clientRequestId: "2", createdAt: new Date("2026-11-14T15:00:00Z") },
        { setlistId: defaultId, performerId: pid, deviceId: "d", clientRequestId: "3", createdAt: now, hiddenAt: now },
      ])
      .returning({ id: requests.id });
    await db.insert(requestItems).values([
      { requestId: r1.id, songId: s1.songId },
      { requestId: r1.id, songId: s2.songId },
      { requestId: r2.id, songId: s1.songId },
      { requestId: r3.id, songId: s1.songId },
    ]);
    let list = await listSetlists(db, pid, now);
    expect(list).toEqual([
      { id: defaultId, name: expect.any(String), publicId, songCount: 2, requestsTonight: 2 },
    ]);
    const item = (await db.select().from(requestItems).where(eq(requestItems.requestId, r1.id)))[0];
    await hideItems(db, pid, "u1", [item.id]);
    list = await listSetlists(db, pid, now);
    expect(list[0].requestsTonight).toBe(1);
  });

  it("getPublicSetlist sorts, unions tags, hides suspended/unpaid/unknown", async () => {
    const t = await addCustomSong(db, pid, "u1", { title: "ข", artist: "x" });
    const e = await addCustomSong(db, pid, "u1", { title: "ก", artist: "y" });
    const { updateRepertoireItem } = await import("@/lib/songs/repertoire");
    const { listRepertoire } = await import("@/lib/songs/repertoire");
    const rep = await listRepertoire(db, pid);
    await updateRepertoireItem(db, pid, rep.find((r) => r.songId === t.songId)!.id, { tags: ["rock", "cool"] });
    await updateRepertoireItem(db, pid, rep.find((r) => r.songId === e.songId)!.id, { tags: ["rock"] });
    const pub = await getPublicSetlist(db, publicId);
    expect(pub!.songs.map((s) => s.title)).toEqual(["ก", "ข"]);
    expect(pub!.tags).toEqual(["cool", "rock"]);
    expect(pub!.performer.displayName).toBe("A");
    expect(pub!.setlistId).toBe(defaultId);
    expect(await getPublicSetlist(db, "nope")).toBeNull();
    await db.update(performers).set({ promptpayId: null }).where(eq(performers.id, pid));
    expect(await getPublicSetlist(db, publicId)).toBeNull();
    await db.update(performers).set({ promptpayId: "0812345678", suspendedAt: new Date() }).where(eq(performers.id, pid));
    expect(await getPublicSetlist(db, publicId)).toBeNull();
    void songs;
  });
});
