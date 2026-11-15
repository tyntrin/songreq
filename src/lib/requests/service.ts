import { and, asc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import {
  blockedDevices,
  performers,
  requestItems,
  requests,
  setlistSongs,
  setlists,
  songs,
} from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/performers/service";
import { deviceLimiter, ipLimiter, type Limiter } from "@/lib/ratelimit/limiter";
import { bus, performerChannel } from "@/lib/realtime/bus";
import { nightRange } from "@/lib/time/night";
import type { RequestInput } from "@/lib/validation/request-input";
import {
  BlockedError,
  ClosedError,
  NotFoundError,
  RateLimitError,
  UnavailableSongsError,
} from "./errors";

export type CreateRequestCtx = {
  publicId: string;
  deviceId: string;
  ip: string;
  now: Date;
  limiters?: { device: Limiter; ip: Limiter };
};

async function findExisting(db: Db, performerId: string, deviceId: string, clientRequestId: string) {
  const [row] = await db
    .select({ id: requests.id, tipAmount: requests.tipAmount })
    .from(requests)
    .where(
      and(
        eq(requests.performerId, performerId),
        eq(requests.deviceId, deviceId),
        eq(requests.clientRequestId, clientRequestId),
      ),
    );
  return row ? { requestId: row.id, tipAmount: row.tipAmount } : null;
}

export async function createRequest(
  db: Db,
  ctx: CreateRequestCtx,
  input: RequestInput,
): Promise<{ requestId: string; tipAmount: number }> {
  const limiters = ctx.limiters ?? { device: deviceLimiter, ip: ipLimiter };

  const [sl] = await db
    .select({
      setlistId: setlists.id,
      performerId: performers.id,
      accepting: performers.acceptingRequests,
      suspendedAt: performers.suspendedAt,
    })
    .from(setlists)
    .innerJoin(performers, eq(performers.id, setlists.performerId))
    .where(eq(setlists.publicId, ctx.publicId));
  if (!sl || sl.suspendedAt) throw new NotFoundError();
  const performerId = sl.performerId;

  const [blocked] = await db
    .select({ d: blockedDevices.deviceId })
    .from(blockedDevices)
    .where(and(eq(blockedDevices.performerId, performerId), eq(blockedDevices.deviceId, ctx.deviceId)));
  if (blocked) throw new BlockedError();

  const existing = await findExisting(db, performerId, ctx.deviceId, input.clientRequestId);
  if (existing) return existing;

  if (!sl.accepting) throw new ClosedError();

  const songIds = [...new Set(input.songIds)];
  const available = await db
    .select({ songId: setlistSongs.songId })
    .from(setlistSongs)
    .where(and(eq(setlistSongs.setlistId, sl.setlistId), inArray(setlistSongs.songId, songIds)));
  const have = new Set(available.map((r) => r.songId));
  const missing = songIds.filter((id) => !have.has(id));
  if (missing.length > 0) throw new UnavailableSongsError(missing);

  // Device first. If the IP limiter then rejects, the device charge is kept (accepted over-charge).
  if (!limiters.device.consume(`${performerId}:${ctx.deviceId}`, songIds.length)) {
    throw new RateLimitError();
  }
  if (!limiters.ip.consume(`${performerId}:${ctx.ip}`, songIds.length)) {
    throw new RateLimitError();
  }

  let requestId: string;
  try {
    requestId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(requests)
        .values({
          setlistId: sl.setlistId,
          performerId,
          deviceId: ctx.deviceId,
          clientRequestId: input.clientRequestId,
          requesterName: input.name,
          message: input.message,
          tipAmount: input.tipAmount,
          createdAt: ctx.now,
        })
        .returning({ id: requests.id });
      await tx.insert(requestItems).values(songIds.map((songId) => ({ requestId: row.id, songId })));
      return row.id;
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const again = await findExisting(db, performerId, ctx.deviceId, input.clientRequestId);
    if (!again) throw e;
    return again;
  }

  bus.publish(performerChannel(performerId), { type: "request.created" });
  return { requestId, tipAmount: input.tipAmount };
}

export async function claimTip(db: Db, requestId: string, deviceId: string, now: Date): Promise<void> {
  const updated = await db
    .update(requests)
    .set({ tipClaimedAt: now })
    .where(
      and(
        eq(requests.id, requestId),
        eq(requests.deviceId, deviceId),
        isNull(requests.tipClaimedAt),
        isNull(requests.hiddenAt),
        gt(requests.tipAmount, 0),
      ),
    )
    .returning({ performerId: requests.performerId });
  if (updated.length > 0) {
    bus.publish(performerChannel(updated[0].performerId), { type: "request.updated" });
  }
}

export type DeviceRequestStatus = {
  requestId: string;
  tipAmount: number;
  tipClaimed: boolean;
  items: Array<{ itemId: string; title: string; artist: string; status: "sent" | "seen" }>;
};

export async function getDeviceStatus(
  db: Db,
  performerId: string,
  deviceId: string,
  now: Date,
): Promise<DeviceRequestStatus[]> {
  const { start, end } = nightRange(now);
  const reqs = await db
    .select({
      id: requests.id,
      tipAmount: requests.tipAmount,
      tipClaimedAt: requests.tipClaimedAt,
    })
    .from(requests)
    .where(
      and(
        eq(requests.performerId, performerId),
        eq(requests.deviceId, deviceId),
        isNull(requests.hiddenAt),
        gte(requests.createdAt, start),
        lt(requests.createdAt, end),
      ),
    )
    .orderBy(asc(requests.createdAt), asc(requests.id));
  if (reqs.length === 0) return [];
  const items = await db
    .select({
      id: requestItems.id,
      requestId: requestItems.requestId,
      seenAt: requestItems.seenAt,
      title: songs.title,
      artist: songs.artist,
    })
    .from(requestItems)
    .innerJoin(songs, eq(songs.id, requestItems.songId))
    .where(inArray(requestItems.requestId, reqs.map((r) => r.id)))
    .orderBy(asc(requestItems.id));
  return reqs.map((r) => ({
    requestId: r.id,
    tipAmount: r.tipAmount,
    tipClaimed: r.tipClaimedAt !== null,
    items: items
      .filter((i) => i.requestId === r.id)
      .map((i) => ({
        itemId: i.id,
        title: i.title,
        artist: i.artist,
        status: i.seenAt ? ("seen" as const) : ("sent" as const),
      })),
  }));
}
