import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { blockedDevices, requestItems, requests, setlists, songs } from "@/lib/db/schema";
import { nightRange } from "@/lib/time/night";
import { bus, deviceChannel, performerChannel } from "@/lib/realtime/bus";
import { requireRole } from "@/lib/performers/service";

export type FeedRow = {
  itemId: string;
  requestId: string;
  songId: string;
  title: string;
  artist: string;
  setlistId: string;
  deviceId: string;
  requesterName: string | null;
  message: string | null;
  tipAmount: number;
  tipClaimed: boolean;
  createdAt: Date;
  seenAt: Date | null;
};

export type FeedCard = {
  songId: string;
  title: string;
  artist: string;
  times: number;
  requesterLabel: string;
  latestMessage: string | null;
  latestAt: Date;
  tipTotal: number;
  isNew: boolean;
  itemIds: string[];
  requestIds: string[];
  /** Latest request on this card: the block action resolves its device server-side. */
  latestRequestId: string;
  /** Distinct customer devices behind this card. Device ids never leave the server. */
  deviceCount: number;
};

const ANON = "ไม่ระบุชื่อ";

/** Sum of claimed tips over distinct requests. */
function claimedTipTotal(rows: FeedRow[]): number {
  const seen = new Map<string, number>();
  for (const r of rows) if (r.tipClaimed) seen.set(r.requestId, r.tipAmount);
  let sum = 0;
  for (const v of seen.values()) sum += v;
  return sum;
}

export function aggregateFeed(rows: FeedRow[]): FeedCard[] {
  const groups = new Map<string, FeedRow[]>();
  for (const r of rows) {
    const g = groups.get(r.songId);
    if (g) g.push(r);
    else groups.set(r.songId, [r]);
  }
  const cards: FeedCard[] = [];
  for (const g of groups.values()) {
    const sorted = [...g].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.itemId.localeCompare(b.itemId),
    );
    const latest = sorted[sorted.length - 1];
    const times = sorted.length;
    const anyName = sorted.some((r) => r.requesterName);
    const requesterLabel = !anyName
      ? ANON
      : times === 1
        ? (latest.requesterName ?? ANON)
        : `${latest.requesterName ?? ANON} และอีก ${times - 1} คน`;
    const latestWithMsg = [...sorted].reverse().find((r) => r.message);
    cards.push({
      songId: latest.songId,
      title: latest.title,
      artist: latest.artist,
      times,
      requesterLabel,
      latestMessage: latestWithMsg?.message ?? null,
      latestAt: latest.createdAt,
      tipTotal: claimedTipTotal(sorted),
      isNew: sorted.some((r) => r.seenAt === null),
      itemIds: sorted.map((r) => r.itemId),
      requestIds: [...new Set(sorted.map((r) => r.requestId))],
      latestRequestId: latest.requestId,
      deviceCount: new Set(sorted.map((r) => r.deviceId)).size,
    });
  }
  return cards.sort(
    (a, b) => b.latestAt.getTime() - a.latestAt.getTime() || a.songId.localeCompare(b.songId),
  );
}

export async function getTonightFeed(
  db: Db,
  performerId: string,
  now: Date,
  setlistId?: string,
): Promise<{ cards: FeedCard[]; requestCount: number; tipTotal: number }> {
  const { start, end } = nightRange(now);
  const found = await db
    .select({
      itemId: requestItems.id,
      requestId: requests.id,
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      setlistId: requests.setlistId,
      deviceId: requests.deviceId,
      requesterName: requests.requesterName,
      message: requests.message,
      tipAmount: requests.tipAmount,
      tipClaimedAt: requests.tipClaimedAt,
      createdAt: requests.createdAt,
      seenAt: requestItems.seenAt,
    })
    .from(requestItems)
    .innerJoin(requests, eq(requests.id, requestItems.requestId))
    .innerJoin(songs, eq(songs.id, requestItems.songId))
    .where(
      and(
        eq(requests.performerId, performerId),
        isNull(requests.hiddenAt),
        isNull(requestItems.hiddenAt),
        gte(requests.createdAt, start),
        lt(requests.createdAt, end),
        setlistId ? eq(requests.setlistId, setlistId) : undefined,
      ),
    );
  const rows: FeedRow[] = found.map(({ tipClaimedAt, ...r }) => ({
    ...r,
    tipClaimed: tipClaimedAt !== null && r.tipAmount > 0,
  }));
  return { cards: aggregateFeed(rows), requestCount: rows.length, tipTotal: claimedTipTotal(rows) };
}

/** Sets seen_at on the performer's unseen items and tells each affected customer device. */
export async function markSeen(
  db: Db,
  performerId: string,
  itemIds: string[],
  now: Date,
): Promise<void> {
  if (itemIds.length === 0) return;
  const updated = await db
    .update(requestItems)
    .set({ seenAt: now })
    .where(
      and(
        inArray(requestItems.id, itemIds),
        isNull(requestItems.seenAt),
        sql`${requestItems.requestId} in (select ${requests.id} from ${requests} where ${requests.performerId} = ${performerId})`,
      ),
    )
    .returning({ requestId: requestItems.requestId });
  if (updated.length === 0) return;
  const reqs = await db
    .select({ deviceId: requests.deviceId })
    .from(requests)
    .where(
      inArray(
        requests.id,
        updated.map((u) => u.requestId),
      ),
    );
  for (const d of new Set(reqs.map((r) => r.deviceId))) {
    bus.publish(deviceChannel(performerId, d), { type: "items.seen" });
  }
}

export async function hideRequest(
  db: Db,
  performerId: string,
  userId: string,
  requestId: string,
): Promise<void> {
  await requireRole(db, performerId, userId, "member");
  const updated = await db
    .update(requests)
    .set({ hiddenAt: new Date() })
    .where(
      and(eq(requests.id, requestId), eq(requests.performerId, performerId), isNull(requests.hiddenAt)),
    )
    .returning({ id: requests.id });
  if (updated.length > 0) bus.publish(performerChannel(performerId), { type: "request.updated" });
}

/**
 * "ซ่อนการ์ดนี้": hides only these items (one song card), scoped to the performer. Other songs and
 * the tip of the same request stay; a request whose items are all hidden drops out of tip totals.
 */
export async function hideItems(
  db: Db,
  performerId: string,
  userId: string,
  itemIds: string[],
): Promise<void> {
  await requireRole(db, performerId, userId, "member");
  if (itemIds.length === 0) return;
  const updated = await db
    .update(requestItems)
    .set({ hiddenAt: new Date() })
    .where(
      and(
        inArray(requestItems.id, itemIds),
        isNull(requestItems.hiddenAt),
        sql`${requestItems.requestId} in (select ${requests.id} from ${requests} where ${requests.performerId} = ${performerId})`,
      ),
    )
    .returning({ requestId: requestItems.requestId });
  if (updated.length === 0) return;
  bus.publish(performerChannel(performerId), { type: "request.updated" });
  const reqs = await db
    .select({ deviceId: requests.deviceId })
    .from(requests)
    .where(
      inArray(
        requests.id,
        updated.map((u) => u.requestId),
      ),
    );
  for (const d of new Set(reqs.map((r) => r.deviceId))) {
    bus.publish(deviceChannel(performerId, d), { type: "request.updated" });
  }
}

/** Blocks the device behind one of the performer's requests (the device id stays server-side). */
export async function blockDeviceByRequest(
  db: Db,
  performerId: string,
  userId: string,
  requestId: string,
): Promise<void> {
  await requireRole(db, performerId, userId, "member");
  const [row] = await db
    .select({ deviceId: requests.deviceId })
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.performerId, performerId)));
  if (!row) return;
  await db.insert(blockedDevices).values({ performerId, deviceId: row.deviceId }).onConflictDoNothing();
}

export type FeedCardJson = Omit<FeedCard, "latestAt"> & { latestAt: string };
export type FeedPayload = {
  cards: FeedCardJson[];
  requestCount: number;
  tipTotal: number;
  setlists: Array<{ id: string; name: string }>;
};

/** Feed + setlist chips as JSON-safe data (shared by the API route and the server-rendered page). */
export async function getFeedPayload(
  db: Db,
  performerId: string,
  now: Date,
  setlistParam?: string | null,
): Promise<FeedPayload> {
  const lists = await db
    .select({ id: setlists.id, name: setlists.name })
    .from(setlists)
    .where(and(eq(setlists.performerId, performerId), isNull(setlists.archivedAt)))
    .orderBy(setlists.createdAt, setlists.id);
  const setlistId = lists.some((l) => l.id === setlistParam) ? (setlistParam as string) : undefined;
  const feed = await getTonightFeed(db, performerId, now, setlistId);
  return {
    cards: feed.cards.map((c) => ({ ...c, latestAt: c.latestAt.toISOString() })),
    requestCount: feed.requestCount,
    tipTotal: feed.tipTotal,
    setlists: lists,
  };
}
