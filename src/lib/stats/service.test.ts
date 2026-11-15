import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { setlists, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { createRateLimiter } from "@/lib/ratelimit/limiter";
import { claimTip, createRequest } from "@/lib/requests/service";
import { setSetlistSongs } from "@/lib/setlists/service";
import { hideRequest } from "@/lib/requests/feed";
import { getStats } from "./service";

const NOW = new Date("2026-11-16T15:00:00Z"); // 22:00 Bangkok, night key 2026-11-16
const DAY = 86_400_000;

describe("getStats", () => {
  let db: Db;
  let pid: string;
  let publicId: string;
  let publicId2: string;
  let songs: string[] = [];
  const make = (publicIdArg: string, deviceId: string, songIds: string[], at: Date, tip = 0) =>
    createRequest(
      db,
      {
        publicId: publicIdArg,
        deviceId,
        ip: "1.1.1.1",
        now: at,
        limiters: {
          device: createRateLimiter({ limit: 10, windowMs: 600000 }),
          ip: createRateLimiter({ limit: 60, windowMs: 600000 }),
        },
      },
      { clientRequestId: crypto.randomUUID(), songIds, name: "Nok", message: null, tipAmount: tip },
    );

  beforeEach(async () => {
    db = await createTestDb();
    await db.insert(users).values({ id: "u1", email: "u1@x.test" });
    const r = await createPerformer(db, "u1", { displayName: "A", promptpayType: "phone", promptpayId: "0812345678" });
    pid = r.performer.id;
    publicId = (await db.select().from(setlists).where(eq(setlists.id, r.defaultSetlistId)))[0].publicId;
    const sl2 = await db
      .insert(setlists)
      .values({ performerId: pid, name: "Event", publicId: "evtpublic1" })
      .returning({ id: setlists.id, publicId: setlists.publicId });
    publicId2 = sl2[0].publicId;
    songs = [];
    for (const t of ["A", "B", "C", "D", "E", "F", "G"]) {
      songs.push((await addCustomSong(db, pid, "u1", { title: t, artist: "x" })).songId);
    }
    await setSetlistSongs(db, pid, sl2[0].id, songs);
  });

  it("counts items, claimed tips once per request, nights, excludes hidden", async () => {
    const a = await make(publicId, "d1", [songs[0], songs[1]], NOW, 50);
    await claimTip(db, a.requestId, "d1", NOW);
    await make(publicId, "d2", [songs[0]], NOW, 30); // unclaimed
    const prev = new Date(NOW.getTime() - DAY);
    await make(publicId2, "d3", [songs[0]], prev);
    const hidden = await make(publicId2, "d4", [songs[2]], prev, 100);
    await claimTip(db, hidden.requestId, "d4", prev);
    await hideRequest(db, pid, "u1", hidden.requestId);

    const s = await getStats(db, pid, "week", NOW);
    expect(s.requestCount).toBe(4);
    expect(s.tipTotal).toBe(50);
    expect(s.nights).toBe(2);
    expect(s.topSongs).toEqual([
      { title: "A", count: 3 },
      { title: "B", count: 1 },
    ]);
    expect(s.bySetlist.map((x) => [x.name, x.count])).toEqual([
      [expect.any(String), 3],
      ["Event", 1],
    ]);

    const night = await getStats(db, pid, "night", NOW);
    expect(night.requestCount).toBe(3);
    expect(night.nights).toBe(1);
  });

  it("week excludes an item 8 nights ago; month includes it", async () => {
    await make(publicId, "d1", [songs[0]], new Date(NOW.getTime() - 8 * DAY));
    await make(publicId, "d2", [songs[1]], NOW);
    expect((await getStats(db, pid, "week", NOW)).requestCount).toBe(1);
    const m2 = await getStats(db, pid, "month", NOW);
    expect(m2.requestCount).toBe(2);
  });

  it("topSongs ordered desc, ties by title, capped at 5", async () => {
    await make(publicId, "d1", [songs[6], songs[5]], NOW);
    await make(publicId, "d2", [songs[4], songs[3], songs[2], songs[1]], NOW);
    await make(publicId, "d3", [songs[6]], NOW);
    const s = await getStats(db, pid, "night", NOW);
    expect(s.topSongs).toHaveLength(5);
    expect(s.topSongs[0]).toEqual({ title: "G", count: 2 });
    expect(s.topSongs.slice(1).map((t) => t.title)).toEqual(["B", "C", "D", "E"]);
  });

  it("empty period", async () => {
    const s = await getStats(db, pid, "night", NOW);
    expect(s).toEqual({ requestCount: 0, tipTotal: 0, nights: 0, topSongs: [], bySetlist: [] });
  });
});
