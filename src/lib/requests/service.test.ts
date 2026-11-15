import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { blockedDevices, performers, requestItems, requests, setlists, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { createRateLimiter } from "@/lib/ratelimit/limiter";
import { bus, performerChannel } from "@/lib/realtime/bus";
import {
  BlockedError,
  ClosedError,
  NotFoundError,
  RateLimitError,
  UnavailableSongsError,
} from "./errors";
import { claimTip, createRequest, getDeviceStatus } from "./service";

let db: Db;
let pid: string;
let publicId: string;
let setlistId: string;
let songA: string;
let songB: string;
const NOW = new Date("2026-11-16T15:00:00Z");
const cid = () => crypto.randomUUID();

function ctx(over: Partial<Parameters<typeof createRequest>[1]> = {}) {
  return {
    publicId,
    deviceId: "dev1",
    ip: "1.1.1.1",
    now: NOW,
    limiters: {
      device: createRateLimiter({ limit: 10, windowMs: 600000 }),
      ip: createRateLimiter({ limit: 60, windowMs: 600000 }),
    },
    ...over,
  };
}
const input = (over = {}) => ({
  clientRequestId: cid(),
  songIds: [songA, songB],
  name: "Nok",
  message: null,
  tipAmount: 50,
  ...over,
});

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(users).values({ id: "u1", email: "u1@x.test" });
  const r = await createPerformer(db, "u1", { displayName: "A", promptpayType: "phone", promptpayId: "0812345678" });
  pid = r.performer.id;
  setlistId = r.defaultSetlistId;
  publicId = (await db.select().from(setlists).where(eq(setlists.id, setlistId)))[0].publicId;
  songA = (await addCustomSong(db, pid, "u1", { title: "A", artist: "x" })).songId;
  songB = (await addCustomSong(db, pid, "u1", { title: "B", artist: "y" })).songId;
});

describe("createRequest", () => {
  it("stores 2 items", async () => {
    const r = await createRequest(db, ctx(), input());
    expect(r.tipAmount).toBe(50);
    expect(await db.select().from(requestItems).where(eq(requestItems.requestId, r.requestId))).toHaveLength(2);
  });

  it("is idempotent per device and clientRequestId (no limiter charge on replay)", async () => {
    const c = ctx();
    const i = input({ songIds: [songA, songB] });
    const a = await createRequest(db, c, i);
    const b = await createRequest(db, c, i);
    expect(b.requestId).toBe(a.requestId);
    expect(await db.select().from(requests)).toHaveLength(1);
    expect(c.limiters.device.consume(`${pid}:dev1`, 8)).toBe(true); // only 2 charged
  });

  it("rejects songs not in setlist", async () => {
    await expect(createRequest(db, ctx(), input({ songIds: [songA, "ghost"] }))).rejects.toMatchObject({
      constructor: UnavailableSongsError,
      unavailableSongIds: ["ghost"],
    });
  });

  it("unknown setlist and suspended performer -> NotFoundError", async () => {
    await expect(createRequest(db, ctx({ publicId: "zzz" }), input())).rejects.toBeInstanceOf(NotFoundError);
    await db.update(performers).set({ suspendedAt: new Date() }).where(eq(performers.id, pid));
    await expect(createRequest(db, ctx(), input())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("closed performer -> ClosedError", async () => {
    await db.update(performers).set({ acceptingRequests: false }).where(eq(performers.id, pid));
    await expect(createRequest(db, ctx(), input())).rejects.toBeInstanceOf(ClosedError);
  });

  it("blocked device -> BlockedError", async () => {
    await db.insert(blockedDevices).values({ performerId: pid, deviceId: "dev1" });
    await expect(createRequest(db, ctx(), input())).rejects.toBeInstanceOf(BlockedError);
  });

  it("11th song within 10 min from same device -> RateLimitError", async () => {
    const c = ctx();
    for (let i = 0; i < 5; i++) await createRequest(db, c, input());
    await expect(createRequest(db, c, input({ songIds: [songA] }))).rejects.toBeInstanceOf(RateLimitError);
    // different device unaffected
    await createRequest(db, { ...c, deviceId: "dev2" }, input());
  });

  it("publishes request.created on the performer channel", async () => {
    const got: string[] = [];
    const off = bus.subscribe(performerChannel(pid), (e) => got.push(e.type));
    await createRequest(db, ctx(), input());
    off();
    expect(got).toEqual(["request.created"]);
  });
});

describe("claimTip / status", () => {
  it("claimTip by another device changes nothing; by owner sets once", async () => {
    const r = await createRequest(db, ctx(), input());
    await claimTip(db, r.requestId, "other", NOW);
    expect((await db.select().from(requests))[0].tipClaimedAt).toBeNull();
    await claimTip(db, r.requestId, "dev1", NOW);
    const first = (await db.select().from(requests))[0].tipClaimedAt;
    expect(first).toEqual(NOW);
    await claimTip(db, r.requestId, "dev1", new Date(NOW.getTime() + 1000));
    expect((await db.select().from(requests))[0].tipClaimedAt).toEqual(NOW);
  });

  it("claimTip ignored when tip is 0 or hidden", async () => {
    const r0 = await createRequest(db, ctx(), input({ tipAmount: 0 }));
    await claimTip(db, r0.requestId, "dev1", NOW);
    const r1 = await createRequest(db, ctx(), input());
    await db.update(requests).set({ hiddenAt: NOW }).where(eq(requests.id, r1.requestId));
    await claimTip(db, r1.requestId, "dev1", NOW);
    expect((await db.select().from(requests)).every((r) => r.tipClaimedAt === null)).toBe(true);
  });

  it("claimTip publishes request.updated", async () => {
    const r = await createRequest(db, ctx(), input());
    const got: string[] = [];
    const off = bus.subscribe(performerChannel(pid), (e) => got.push(e.type));
    await claimTip(db, r.requestId, "dev1", NOW);
    await claimTip(db, r.requestId, "dev1", NOW);
    off();
    expect(got).toEqual(["request.updated"]);
  });

  it("status: tonight only, hidden excluded, seen state", async () => {
    const tonight = await createRequest(db, ctx(), input());
    const hidden = await createRequest(db, ctx(), input());
    await db.update(requests).set({ hiddenAt: NOW }).where(eq(requests.id, hidden.requestId));
    const old = await createRequest(db, ctx({ now: new Date("2026-11-14T15:00:00Z") }), input());
    await db
      .update(requests)
      .set({ createdAt: new Date("2026-11-14T15:00:00Z") })
      .where(eq(requests.id, old.requestId));
    await db
      .update(requests)
      .set({ createdAt: NOW })
      .where(eq(requests.id, tonight.requestId));
    let s = await getDeviceStatus(db, pid, "dev1", NOW);
    expect(s.map((x) => x.requestId)).toEqual([tonight.requestId]);
    expect(s[0].items.map((i) => i.status)).toEqual(["sent", "sent"]);
    expect(s[0].tipClaimed).toBe(false);
    await db
      .update(requestItems)
      .set({ seenAt: NOW })
      .where(eq(requestItems.requestId, tonight.requestId));
    s = await getDeviceStatus(db, pid, "dev1", NOW);
    expect(s[0].items.map((i) => i.status)).toEqual(["seen", "seen"]);
    expect(await getDeviceStatus(db, pid, "nobody", NOW)).toEqual([]);
  });
});
