import { count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { performerMembers, performers, requestItems, requests, songs } from "@/lib/db/schema";

export async function getAdminOverview(db: Db, now: Date) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [[p], [w], [a]] = await Promise.all([
    db.select({ n: count() }).from(performers),
    db.select({ n: count() }).from(requests).where(gte(requests.createdAt, weekAgo)),
    db.select({ n: count() }).from(requests),
  ]);
  const performerRows = await db
    .select({
      id: performers.id,
      name: performers.displayName,
      slug: performers.slug,
      createdAt: performers.createdAt,
      suspendedAt: performers.suspendedAt,
      members: sql<number>`(select count(*)::int from ${performerMembers} where ${performerMembers.performerId} = ${performers.id})`,
    })
    .from(performers)
    .orderBy(desc(performers.createdAt));
  const reqRows = await db
    .select({
      id: requests.id,
      createdAt: requests.createdAt,
      performer: performers.displayName,
      requesterName: requests.requesterName,
      message: requests.message,
    })
    .from(requests)
    .innerJoin(performers, eq(performers.id, requests.performerId))
    .orderBy(desc(requests.createdAt))
    .limit(50);
  const ids = reqRows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({ requestId: requestItems.requestId, title: songs.title, artist: songs.artist })
        .from(requestItems)
        .innerJoin(songs, eq(songs.id, requestItems.songId))
        .where(inArray(requestItems.requestId, ids))
    : [];
  return {
    totals: { performers: p.n, last7Days: w.n, allTime: a.n },
    performers: performerRows,
    requests: reqRows.map((r) => ({
      ...r,
      songs: items.filter((i) => i.requestId === r.id).map((i) => `${i.title} - ${i.artist}`),
    })),
  };
}

export async function setSuspended(db: Db, performerId: string, suspended: boolean, now: Date) {
  await db.update(performers).set({ suspendedAt: suspended ? now : null }).where(eq(performers.id, performerId));
}

/** Hard delete; request_items cascade. */
export async function deleteRequest(db: Db, requestId: string) {
  await db.delete(requests).where(eq(requests.id, requestId));
}

