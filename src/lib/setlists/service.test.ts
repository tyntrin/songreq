import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { performers, requests, setlistSongs, setlists, songs, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { ValidationError } from "@/lib/validation/text";
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

  it("cannot delete the last setlist", async () => {
    await expect(deleteSetlist(db, pid, defaultId)).rejects.toMatchObject({ field: "setlist" });
    await createSetlist(db, pid, "two");
    await deleteSetlist(db, pid, defaultId);
    expect(await db.select().from(setlists).where(eq(setlists.performerId, pid))).toHaveLength(1);
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

  it("listSetlists counts songs and tonight's requests", async () => {
    const s1 = await addCustomSong(db, pid, "u1", { title: "B", artist: "x" });
    const now = new Date("2026-11-16T15:00:00Z");
    await db.insert(requests).values([
      { setlistId: defaultId, performerId: pid, deviceId: "d", clientRequestId: "1", createdAt: now },
      { setlistId: defaultId, performerId: pid, deviceId: "d", clientRequestId: "2", createdAt: new Date("2026-11-14T15:00:00Z") },
    ]);
    const list = await listSetlists(db, pid, now);
    expect(list).toEqual([
      { id: defaultId, name: expect.any(String), publicId, songCount: 1, requestsTonight: 1 },
    ]);
    void s1;
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
