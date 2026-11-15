import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { blockedDevices, requestItems, requests, setlists, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { createRateLimiter } from "@/lib/ratelimit/limiter";
import { bus, deviceChannel, performerChannel, type BusEvent } from "@/lib/realtime/bus";
import { claimTip, createRequest } from "./service";
import { aggregateFeed, blockDevice, getTonightFeed, hideRequest, markSeen, type FeedRow } from "./feed";

const T = (m: number) => new Date(Date.UTC(2026, 10, 16, 15, m));
let n = 0;
function row(over: Partial<FeedRow> = {}): FeedRow {
  n++;
  return {
    itemId: `i${n}`,
    requestId: `r${n}`,
    songId: "s1",
    title: "T",
    artist: "A",
    setlistId: "sl",
    deviceId: `d${n}`,
    requesterName: null,
    message: null,
    tipAmount: 0,
    tipClaimed: false,
    createdAt: T(n),
    seenAt: null,
    ...over,
  };
}

describe("aggregateFeed", () => {
  it("groups the same song, labels the latest requester", () => {
    const [c, ...rest] = aggregateFeed([
      row({ requesterName: "มิ้น", createdAt: T(1) }),
      row({ requesterName: null, createdAt: T(2) }),
      row({ requesterName: "เจมส์", createdAt: T(3), message: "สุขสันต์" }),
    ]);
    expect(rest).toHaveLength(0);
    expect(c.times).toBe(3);
    expect(c.requesterLabel).toBe("เจมส์ และอีก 2 คน");
    expect(c.latestMessage).toBe("สุขสันต์");
    expect(c.latestAt).toEqual(T(3));
    expect(c.isNew).toBe(true);
    expect(c.itemIds).toHaveLength(3);
  });
  it("labels", () => {
    expect(aggregateFeed([row()])[0].requesterLabel).toBe("ไม่ระบุชื่อ");
    expect(aggregateFeed([row({ requesterName: "นก" })])[0].requesterLabel).toBe("นก");
  });
  it("sums claimed tips once per request, excludes unclaimed, sorts by latest", () => {
    const cards = aggregateFeed([
      row({ songId: "a", requestId: "R", tipAmount: 50, tipClaimed: true, createdAt: T(1), seenAt: T(2) }),
      row({ songId: "b", requestId: "R", tipAmount: 50, tipClaimed: true, createdAt: T(1), seenAt: T(2) }),
      row({ songId: "b", requestId: "Q", tipAmount: 70, tipClaimed: false, createdAt: T(5), seenAt: T(6) }),
      row({ songId: "c", createdAt: T(3), seenAt: T(4) }),
    ]);
    expect(cards.map((c) => c.songId)).toEqual(["b", "c", "a"]);
    expect(cards[0].tipTotal).toBe(50);
    expect(cards[0].isNew).toBe(false);
    expect(cards[0].requestIds.sort()).toEqual(["Q", "R"]);
  });
});

describe("feed db", () => {
  let db: Db;
  let pid: string;
  let pid2: string;
  let publicId: string;
  let songA: string;
  let songB: string;
  const NOW = new Date("2026-11-16T15:00:00Z");
  const limiters = () => ({
    device: createRateLimiter({ limit: 10, windowMs: 600000 }),
    ip: createRateLimiter({ limit: 60, windowMs: 600000 }),
  });
  const make = (deviceId: string, songIds: string[], tipAmount = 0, name: string | null = "Nok") =>
    createRequest(
      db,
      { publicId, deviceId, ip: "1.1.1.1", now: NOW, limiters: limiters() },
      { clientRequestId: crypto.randomUUID(), songIds, name, message: null, tipAmount },
    );

  beforeEach(async () => {
    db = await createTestDb();
    await db.insert(users).values([
      { id: "u1", email: "u1@x.test" },
      { id: "u2", email: "u2@x.test" },
    ]);
    const r = await createPerformer(db, "u1", { displayName: "A", promptpayType: "phone", promptpayId: "0812345678" });
    pid = r.performer.id;
    publicId = (await db.select().from(setlists).where(eq(setlists.id, r.defaultSetlistId)))[0].publicId;
    pid2 = (await createPerformer(db, "u2", { displayName: "B", promptpayType: "phone", promptpayId: "0812345678" })).performer.id;
    songA = (await addCustomSong(db, pid, "u1", { title: "A", artist: "x" })).songId;
    songB = (await addCustomSong(db, pid, "u1", { title: "B", artist: "y" })).songId;
  });

  it("getTonightFeed counts items and distinct-request claimed tips, excludes hidden", async () => {
    const a = await make("d1", [songA, songB], 50);
    await claimTip(db, a.requestId, "d1", NOW);
    await make("d2", [songA], 30);
    let feed = await getTonightFeed(db, pid, NOW);
    expect(feed.requestCount).toBe(3);
    expect(feed.tipTotal).toBe(50);
    expect(feed.cards).toHaveLength(2);
    await hideRequest(db, pid, "u1", a.requestId);
    feed = await getTonightFeed(db, pid, NOW);
    expect(feed.requestCount).toBe(1);
    expect(feed.tipTotal).toBe(0);
  });

  it("markSeen is idempotent and only touches own performer", async () => {
    await make("d1", [songA]);
    const ids = (await db.select().from(requestItems)).map((i) => i.id);
    const events: BusEvent[] = [];
    const off = bus.subscribe(deviceChannel(pid, "d1"), (e) => events.push(e));
    await markSeen(db, pid2, ids, T(1));
    expect((await db.select().from(requestItems))[0].seenAt).toBeNull();
    expect(events).toHaveLength(0);
    await markSeen(db, pid, ids, T(1));
    await markSeen(db, pid, ids, T(9));
    off();
    expect((await db.select().from(requestItems))[0].seenAt).toEqual(T(1));
    expect(events).toEqual([{ type: "items.seen" }]);
  });

  it("hideRequest/blockDevice are scoped and publish", async () => {
    const a = await make("d1", [songA]);
    const events: BusEvent[] = [];
    const off = bus.subscribe(performerChannel(pid), (e) => events.push(e));
    await hideRequest(db, pid2, "u2", a.requestId);
    expect((await db.select().from(requests))[0].hiddenAt).toBeNull();
    await hideRequest(db, pid, "u1", a.requestId);
    off();
    expect((await db.select().from(requests))[0].hiddenAt).not.toBeNull();
    expect(events).toEqual([{ type: "request.updated" }]);
    await blockDevice(db, pid, "u1", "d1");
    await blockDevice(db, pid, "u1", "d1");
    expect(await db.select().from(blockedDevices)).toHaveLength(1);
    await expect(blockDevice(db, pid, "u2", "d1")).rejects.toThrow();
  });
});
