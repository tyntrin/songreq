import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { blockedDevices, requestItems, requests, setlists, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { createRateLimiter } from "@/lib/ratelimit/limiter";
import { bus, deviceChannel, performerChannel, type BusEvent } from "@/lib/realtime/bus";
import { claimTip, createRequest, getDeviceStatus } from "./service";
import { getStats } from "@/lib/stats/service";
import {
  aggregateFeed,
  blockDeviceByRequest,
  getFeedPayload,
  getTonightFeed,
  hideItems,
  hideRequest,
  markSeen,
  type FeedRow,
} from "./feed";

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
    expect(cards[0].latestRequestId).toBe("Q");
    expect(cards[0].deviceCount).toBe(2);
    expect(cards[2].deviceCount).toBe(1);
    expect(cards[0]).not.toHaveProperty("deviceIds");
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

  it("hideRequest is scoped and publishes", async () => {
    const a = await make("d1", [songA]);
    const events: BusEvent[] = [];
    const off = bus.subscribe(performerChannel(pid), (e) => events.push(e));
    await hideRequest(db, pid2, "u2", a.requestId);
    expect((await db.select().from(requests))[0].hiddenAt).toBeNull();
    await hideRequest(db, pid, "u1", a.requestId);
    off();
    expect((await db.select().from(requests))[0].hiddenAt).not.toBeNull();
    expect(events).toEqual([{ type: "request.updated" }]);
  });

  it("blockDeviceByRequest resolves the device server-side, scoped to the performer", async () => {
    const a = await make("d1", [songA]);
    await blockDeviceByRequest(db, pid, "u1", a.requestId);
    await blockDeviceByRequest(db, pid, "u1", a.requestId);
    expect(await db.select().from(blockedDevices)).toEqual([
      { performerId: pid, deviceId: "d1", createdAt: expect.any(Date) },
    ]);
    // non-member, or a request of another performer: nothing happens
    await expect(blockDeviceByRequest(db, pid, "u2", a.requestId)).rejects.toThrow();
    await blockDeviceByRequest(db, pid2, "u2", a.requestId);
    await blockDeviceByRequest(db, pid, "u1", "no-such-request");
    expect(await db.select().from(blockedDevices)).toHaveLength(1);
  });

  it("feed payload never exposes device ids", async () => {
    await make("secret-device-1", [songA]);
    const payload = await getFeedPayload(db, pid, NOW);
    expect(JSON.stringify(payload)).not.toContain("secret-device-1");
    expect(payload.cards[0].deviceCount).toBe(1);
    expect(typeof payload.cards[0].latestRequestId).toBe("string");
  });

  it("hideItems: hiding one song of a 2-song request keeps the other card and the tip", async () => {
    const a = await make("d1", [songA, songB], 50);
    await claimTip(db, a.requestId, "d1", NOW);
    let feed = await getTonightFeed(db, pid, NOW);
    const cardB = feed.cards.find((c) => c.songId === songB)!;
    const perf: BusEvent[] = [];
    const dev: BusEvent[] = [];
    const off1 = bus.subscribe(performerChannel(pid), (e) => perf.push(e));
    const off2 = bus.subscribe(deviceChannel(pid, "d1"), (e) => dev.push(e));
    await hideItems(db, pid, "u1", cardB.itemIds);
    off1();
    off2();
    expect(perf).toEqual([{ type: "request.updated" }]);
    expect(dev).toEqual([{ type: "request.updated" }]);
    feed = await getTonightFeed(db, pid, NOW);
    expect(feed.cards.map((c) => c.songId)).toEqual([songA]);
    expect(feed.cards[0].tipTotal).toBe(50);
    expect(feed.requestCount).toBe(1);
    expect(feed.tipTotal).toBe(50);
    const stats = await getStats(db, pid, "night", NOW);
    expect(stats.requestCount).toBe(1);
    expect(stats.tipTotal).toBe(50);
    const status = await getDeviceStatus(db, pid, "d1", NOW);
    expect(status[0].items.map((i) => i.title)).toEqual(["A"]);
  });

  it("hideItems: hiding the only song of a tipped request removes the tip from totals", async () => {
    const a = await make("d1", [songA], 50);
    await claimTip(db, a.requestId, "d1", NOW);
    await make("d2", [songA, songB], 0);
    const before = await getTonightFeed(db, pid, NOW);
    expect(before.tipTotal).toBe(50);
    const itemOfA = (await db.select().from(requestItems).where(eq(requestItems.requestId, a.requestId)))[0];
    await hideItems(db, pid, "u1", [itemOfA.id]);
    const feed = await getTonightFeed(db, pid, NOW);
    expect(feed.tipTotal).toBe(0);
    expect(feed.requestCount).toBe(2);
    expect(feed.cards.find((c) => c.songId === songA)!.tipTotal).toBe(0);
    expect((await getStats(db, pid, "night", NOW)).tipTotal).toBe(0);
    // the customer no longer sees that request at all
    expect(await getDeviceStatus(db, pid, "d1", NOW)).toEqual([]);
  });

  it("hideItems is scoped to the performer and requires membership", async () => {
    await make("d1", [songA]);
    const ids = (await db.select().from(requestItems)).map((i) => i.id);
    await expect(hideItems(db, pid, "u2", ids)).rejects.toThrow();
    const events: BusEvent[] = [];
    const off = bus.subscribe(performerChannel(pid2), (e) => events.push(e));
    await hideItems(db, pid2, "u2", ids);
    off();
    expect(events).toEqual([]);
    expect((await db.select().from(requestItems))[0].hiddenAt).toBeNull();
    await hideItems(db, pid, "u1", []);
  });
});
