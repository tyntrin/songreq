import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { repertoire, setlistSongs, setlists, songs, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { ValidationError } from "@/lib/validation/text";
import {
  addCustomSong,
  addItunesSong,
  listRepertoire,
  removeRepertoireItem,
  updateRepertoireItem,
} from "./repertoire";

let db: Db;
let pid: string;
let sid: string;
const hit = { itunesTrackId: 123, title: "Yellow", artist: "Coldplay" };

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(users).values({ id: "u1", email: "u1@x.test" });
  const r = await createPerformer(db, "u1", {
    displayName: "วง",
    promptpayType: "phone",
    promptpayId: "0812345678",
  });
  pid = r.performer.id;
  sid = r.defaultSetlistId;
});

describe("repertoire", () => {
  it("adding same iTunes song twice yields one row", async () => {
    const a = await addItunesSong(db, pid, hit);
    const b = await addItunesSong(db, pid, hit);
    expect(b.id).toBe(a.id);
    expect(await db.select().from(repertoire)).toHaveLength(1);
    expect(await db.select().from(songs)).toHaveLength(1);
    expect(await db.select().from(setlistSongs)).toHaveLength(1);
  });

  it("custom song appears in default setlist with next position", async () => {
    await addItunesSong(db, pid, hit);
    const c = await addCustomSong(db, pid, "u1", { title: " ทางของฝุ่น ", artist: "Atom" });
    expect(c.title).toBe("ทางของฝุ่น");
    const rows = await db.select().from(setlistSongs).where(eq(setlistSongs.setlistId, sid));
    expect(rows.find((r) => r.songId === c.songId)!.position).toBe(
      Math.max(...rows.map((r) => r.position)),
    );
    expect(rows).toHaveLength(2);
  });

  it("rejects bad custom input", async () => {
    await expect(addCustomSong(db, pid, "u1", { title: "", artist: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      addCustomSong(db, pid, "u1", { title: "x".repeat(121), artist: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists sorted by Thai locale title", async () => {
    await addCustomSong(db, pid, "u1", { title: "ข", artist: "a" });
    await addCustomSong(db, pid, "u1", { title: "ก", artist: "a" });
    await addCustomSong(db, pid, "u1", { title: "Zed", artist: "a" });
    const l = await listRepertoire(db, pid);
    expect(l.map((x) => x.title)).toEqual(["ก", "ข", "Zed"].sort((a, b) => a.localeCompare(b, "th")));
  });

  it("remove deletes from repertoire and this performer's setlists", async () => {
    const a = await addItunesSong(db, pid, hit);
    await removeRepertoireItem(db, pid, a.id);
    expect(await db.select().from(repertoire)).toHaveLength(0);
    expect(await db.select().from(setlistSongs)).toHaveLength(0);
    expect(await db.select().from(setlists)).toHaveLength(1);
  });

  it("update key and tags with limits", async () => {
    const a = await addItunesSong(db, pid, hit);
    await updateRepertoireItem(db, pid, a.id, { songKey: "Ab", tags: ["ช้า", "คู่"] });
    expect((await listRepertoire(db, pid))[0]).toMatchObject({ songKey: "Ab", tags: ["ช้า", "คู่"] });
    await updateRepertoireItem(db, pid, a.id, { songKey: null });
    expect((await listRepertoire(db, pid))[0].songKey).toBeNull();
    await expect(
      updateRepertoireItem(db, pid, a.id, { tags: ["1", "2", "3", "4", "5", "6"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(updateRepertoireItem(db, pid, a.id, { tags: ["x".repeat(21)] })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateRepertoireItem(db, pid, a.id, { songKey: "1234567" })).rejects.toBeInstanceOf(ValidationError);
  });
});
