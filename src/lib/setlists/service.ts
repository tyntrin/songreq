import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import {
  performers,
  repertoire,
  requests,
  setlistSongs,
  setlists,
  songs,
} from "@/lib/db/schema";
import { generatePublicId, isUniqueViolation } from "@/lib/performers/service";
import { nightRange } from "@/lib/time/night";
import { ValidationError, cleanText } from "@/lib/validation/text";
import type { PromptPayType } from "@/lib/promptpay/promptpay";

function validName(raw: unknown): string {
  let name: string | null;
  try {
    name = cleanText(raw, 40);
  } catch {
    throw new ValidationError("name", "Name longer than 40 characters");
  }
  if (!name) throw new ValidationError("name", "Name required");
  return name;
}

export async function createSetlist(
  db: Db,
  performerId: string,
  rawName: string,
): Promise<{ id: string; name: string; publicId: string }> {
  const name = validName(rawName);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(setlists)
        .values({ performerId, name, publicId: generatePublicId() })
        .returning({ id: setlists.id, name: setlists.name, publicId: setlists.publicId });
      return row;
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

export async function renameSetlist(
  db: Db,
  performerId: string,
  setlistId: string,
  rawName: string,
): Promise<void> {
  const name = validName(rawName);
  await db
    .update(setlists)
    .set({ name })
    .where(and(eq(setlists.id, setlistId), eq(setlists.performerId, performerId)));
}

export async function deleteSetlist(db: Db, performerId: string, setlistId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const mine = await tx
      .select({ id: setlists.id })
      .from(setlists)
      .where(eq(setlists.performerId, performerId));
    if (!mine.some((s) => s.id === setlistId)) return;
    if (mine.length <= 1) throw new ValidationError("setlist", "Cannot delete the last setlist");
    await tx
      .delete(setlists)
      .where(and(eq(setlists.id, setlistId), eq(setlists.performerId, performerId)));
  });
}

export async function setSetlistSongs(
  db: Db,
  performerId: string,
  setlistId: string,
  songIds: string[],
): Promise<void> {
  const ordered = [...new Set(songIds)];
  await db.transaction(async (tx) => {
    const [sl] = await tx
      .select({ id: setlists.id })
      .from(setlists)
      .where(and(eq(setlists.id, setlistId), eq(setlists.performerId, performerId)));
    if (!sl) return;
    if (ordered.length > 0) {
      const owned = await tx
        .select({ songId: repertoire.songId })
        .from(repertoire)
        .where(and(eq(repertoire.performerId, performerId), inArray(repertoire.songId, ordered)));
      if (owned.length !== ordered.length) {
        throw new ValidationError("songIds", "Songs must be in your repertoire");
      }
    }
    await tx.delete(setlistSongs).where(eq(setlistSongs.setlistId, setlistId));
    if (ordered.length > 0) {
      await tx
        .insert(setlistSongs)
        .values(ordered.map((songId, position) => ({ setlistId, songId, position })));
    }
  });
}

export async function listSetlists(
  db: Db,
  performerId: string,
  now: Date,
): Promise<Array<{ id: string; name: string; publicId: string; songCount: number; requestsTonight: number }>> {
  const lists = await db
    .select({ id: setlists.id, name: setlists.name, publicId: setlists.publicId })
    .from(setlists)
    .where(eq(setlists.performerId, performerId))
    .orderBy(asc(setlists.createdAt), asc(setlists.id));
  if (lists.length === 0) return [];
  const ids = lists.map((l) => l.id);
  const songCounts = await db
    .select({ id: setlistSongs.setlistId, n: count() })
    .from(setlistSongs)
    .where(inArray(setlistSongs.setlistId, ids))
    .groupBy(setlistSongs.setlistId);
  const { start, end } = nightRange(now);
  const reqCounts = await db
    .select({ id: requests.setlistId, n: count() })
    .from(requests)
    .where(
      and(
        inArray(requests.setlistId, ids),
        gte(requests.createdAt, start),
        lt(requests.createdAt, end),
      ),
    )
    .groupBy(requests.setlistId);
  const sc = new Map(songCounts.map((r) => [r.id, Number(r.n)]));
  const rc = new Map(reqCounts.map((r) => [r.id, Number(r.n)]));
  return lists.map((l) => ({
    ...l,
    songCount: sc.get(l.id) ?? 0,
    requestsTonight: rc.get(l.id) ?? 0,
  }));
}

export type PublicSetlist = {
  setlistId: string;
  performer: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    promptpayType: PromptPayType;
    promptpayId: string;
    acceptingRequests: boolean;
  };
  songs: Array<{ id: string; title: string; artist: string; tags: string[] }>;
  tags: string[];
};

export async function getPublicSetlist(db: Db, publicId: string): Promise<PublicSetlist | null> {
  const [row] = await db
    .select({
      setlistId: setlists.id,
      performerId: performers.id,
      displayName: performers.displayName,
      avatarUrl: performers.avatarUrl,
      promptpayType: performers.promptpayType,
      promptpayId: performers.promptpayId,
      acceptingRequests: performers.acceptingRequests,
      suspendedAt: performers.suspendedAt,
    })
    .from(setlists)
    .innerJoin(performers, eq(performers.id, setlists.performerId))
    .where(eq(setlists.publicId, publicId));
  if (!row || row.suspendedAt || !row.promptpayId || !row.promptpayType) return null;

  const rows = await db
    .select({ id: songs.id, title: songs.title, artist: songs.artist, tags: repertoire.tags })
    .from(setlistSongs)
    .innerJoin(songs, eq(songs.id, setlistSongs.songId))
    .innerJoin(
      repertoire,
      and(eq(repertoire.songId, songs.id), eq(repertoire.performerId, row.performerId)),
    )
    .where(eq(setlistSongs.setlistId, row.setlistId));
  rows.sort((a, b) => a.title.localeCompare(b.title, "th") || a.id.localeCompare(b.id));
  const tags = [...new Set(rows.flatMap((r) => r.tags))].sort();
  return {
    setlistId: row.setlistId,
    performer: {
      id: row.performerId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      promptpayType: row.promptpayType,
      promptpayId: row.promptpayId,
      acceptingRequests: row.acceptingRequests,
    },
    songs: rows,
    tags,
  };
}
