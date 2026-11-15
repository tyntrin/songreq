import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/lib/db/types";
import { requestItems, requests, setlists, users } from "@/lib/db/schema";
import { createPerformer } from "@/lib/performers/service";
import { addCustomSong } from "@/lib/songs/repertoire";
import { createRateLimiter } from "@/lib/ratelimit/limiter";
import { createRequest } from "@/lib/requests/service";
import { bus, performerChannel, type BusEvent } from "@/lib/realtime/bus";
import { deleteRequest } from "./service";

describe("admin deleteRequest", () => {
  let db: Db;
  let pid: string;
  let requestId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await db.insert(users).values({ id: "u1", email: "u1@x.test" });
    const r = await createPerformer(db, "u1", { displayName: "A", promptpayType: "phone", promptpayId: "0812345678" });
    pid = r.performer.id;
    const publicId = (await db.select().from(setlists).where(eq(setlists.id, r.defaultSetlistId)))[0].publicId;
    const song = await addCustomSong(db, pid, "u1", { title: "A", artist: "x" });
    requestId = (
      await createRequest(
        db,
        {
          publicId,
          deviceId: "d1",
          ip: "1.1.1.1",
          now: new Date(),
          limiters: {
            device: createRateLimiter({ limit: 10, windowMs: 600000 }),
            ip: createRateLimiter({ limit: 60, windowMs: 600000 }),
          },
        },
        { clientRequestId: crypto.randomUUID(), songIds: [song.songId], name: null, message: null, tipAmount: 0 },
      )
    ).requestId;
  });

  it("deletes the request with its items and tells the performer's monitor", async () => {
    const events: BusEvent[] = [];
    const off = bus.subscribe(performerChannel(pid), (e) => events.push(e));
    await deleteRequest(db, requestId);
    await deleteRequest(db, requestId); // already gone: no second event
    off();
    expect(await db.select().from(requests)).toHaveLength(0);
    expect(await db.select().from(requestItems)).toHaveLength(0);
    expect(events).toEqual([{ type: "request.updated" }]);
  });
});
