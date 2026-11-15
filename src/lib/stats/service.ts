import { and, eq, gte, isNull, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { requestItems, requests, setlists, songs } from "@/lib/db/schema";
import { nightKey, periodRange } from "@/lib/time/night";

export type StatsPeriod = "night" | "week" | "month";

export type Stats = {
  requestCount: number;
  tipTotal: number;
  nights: number;
  topSongs: Array<{ title: string; count: number }>;
  bySetlist: Array<{ setlistId: string; name: string; count: number }>;
};

const th = (a: string, b: string) => a.localeCompare(b, "th");

export async function getStats(
  db: Db,
  performerId: string,
  period: StatsPeriod,
  now: Date,
): Promise<Stats> {
  const { start, end } = periodRange(period, now);
  const rows = await db
    .select({
      requestId: requests.id,
      songId: songs.id,
      title: songs.title,
      setlistId: setlists.id,
      setlistName: setlists.name,
      tipAmount: requests.tipAmount,
      tipClaimedAt: requests.tipClaimedAt,
      createdAt: requests.createdAt,
    })
    .from(requestItems)
    .innerJoin(requests, eq(requests.id, requestItems.requestId))
    .innerJoin(songs, eq(songs.id, requestItems.songId))
    .innerJoin(setlists, eq(setlists.id, requests.setlistId))
    .where(
      and(
        eq(requests.performerId, performerId),
        isNull(requests.hiddenAt),
        gte(requests.createdAt, start),
        lt(requests.createdAt, end),
      ),
    );

  const tips = new Map<string, number>(); // claimed tips, once per request
  const nights = new Set<string>();
  const songCounts = new Map<string, { title: string; count: number }>();
  const listCounts = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (r.tipClaimedAt !== null && r.tipAmount > 0) tips.set(r.requestId, r.tipAmount);
    nights.add(nightKey(r.createdAt));
    const s = songCounts.get(r.songId);
    if (s) s.count++;
    else songCounts.set(r.songId, { title: r.title, count: 1 });
    const l = listCounts.get(r.setlistId);
    if (l) l.count++;
    else listCounts.set(r.setlistId, { name: r.setlistName, count: 1 });
  }
  let tipTotal = 0;
  for (const v of tips.values()) tipTotal += v;

  return {
    requestCount: rows.length,
    tipTotal,
    nights: nights.size,
    topSongs: [...songCounts.values()]
      .sort((a, b) => b.count - a.count || th(a.title, b.title))
      .slice(0, 5),
    bySetlist: [...listCounts.entries()]
      .map(([setlistId, v]) => ({ setlistId, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count || th(a.name, b.name)),
  };
}
