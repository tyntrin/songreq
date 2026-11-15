import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { repertoire, setlistSongs, setlists, songs } from "@/lib/db/schema";
import { ValidationError, cleanText } from "@/lib/validation/text";
import type { SongHit } from "./itunes";

export type RepertoireItem = {
  id: string;
  songId: string;
  itunesTrackId: string | null;
  title: string;
  artist: string;
  songKey: string | null;
  tags: string[];
};

function field(raw: unknown, name: string, max: number): string {
  let v: string | null;
  try {
    v = cleanText(raw, max);
  } catch {
    throw new ValidationError(name, `${name} longer than ${max} characters`);
  }
  if (!v) throw new ValidationError(name, `${name} required`);
  return v;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Append song to the performer's oldest active setlist (created_at, then id). No-op if already there. */
async function appendToOldestSetlist(tx: Tx, performerId: string, songId: string): Promise<void> {
  const [sl] = await tx
    .select({ id: setlists.id })
    .from(setlists)
    .where(and(eq(setlists.performerId, performerId), isNull(setlists.archivedAt)))
    .orderBy(asc(setlists.createdAt), asc(setlists.id))
    .limit(1);
  if (!sl) return;
  const [m] = await tx
    .select({ max: sql<number | null>`max(${setlistSongs.position})` })
    .from(setlistSongs)
    .where(eq(setlistSongs.setlistId, sl.id));
  await tx
    .insert(setlistSongs)
    .values({ setlistId: sl.id, songId, position: (m?.max ?? -1) + 1 })
    .onConflictDoNothing();
}

async function addToRepertoire(
  db: Db,
  performerId: string,
  song: { id: string; title: string; artist: string; itunesTrackId: string | null },
): Promise<RepertoireItem> {
  return db.transaction(async (tx) => {
    await tx.insert(repertoire).values({ performerId, songId: song.id }).onConflictDoNothing();
    const [row] = await tx
      .select({ id: repertoire.id, songKey: repertoire.songKey, tags: repertoire.tags })
      .from(repertoire)
      .where(and(eq(repertoire.performerId, performerId), eq(repertoire.songId, song.id)));
    await appendToOldestSetlist(tx, performerId, song.id);
    return {
      id: row.id,
      songId: song.id,
      itunesTrackId: song.itunesTrackId,
      title: song.title,
      artist: song.artist,
      songKey: row.songKey,
      tags: row.tags,
    };
  });
}

export async function addItunesSong(db: Db, performerId: string, hit: SongHit): Promise<RepertoireItem> {
  const title = field(hit.title, "title", 120);
  const artist = field(hit.artist, "artist", 120);
  if (!Number.isSafeInteger(hit.itunesTrackId)) throw new ValidationError("itunesTrackId");
  const trackId = String(hit.itunesTrackId);

  await db
    .insert(songs)
    .values({ title, artist, source: "itunes", itunesTrackId: trackId })
    .onConflictDoNothing({ target: songs.itunesTrackId });
  const [song] = await db
    .select({ id: songs.id, title: songs.title, artist: songs.artist, itunesTrackId: songs.itunesTrackId })
    .from(songs)
    .where(eq(songs.itunesTrackId, trackId));
  return addToRepertoire(db, performerId, song);
}

export async function addCustomSong(
  db: Db,
  performerId: string,
  userId: string,
  input: { title: string; artist: string },
): Promise<RepertoireItem> {
  const title = field(input.title, "title", 120);
  const artist = field(input.artist, "artist", 120);
  const [song] = await db
    .insert(songs)
    .values({ title, artist, source: "custom", createdBy: userId })
    .returning({ id: songs.id, title: songs.title, artist: songs.artist, itunesTrackId: songs.itunesTrackId });
  return addToRepertoire(db, performerId, song);
}

export async function listRepertoire(db: Db, performerId: string): Promise<RepertoireItem[]> {
  const rows = await db
    .select({
      id: repertoire.id,
      songId: songs.id,
      itunesTrackId: songs.itunesTrackId,
      title: songs.title,
      artist: songs.artist,
      songKey: repertoire.songKey,
      tags: repertoire.tags,
    })
    .from(repertoire)
    .innerJoin(songs, eq(songs.id, repertoire.songId))
    .where(eq(repertoire.performerId, performerId));
  return rows.sort((a, b) => a.title.localeCompare(b.title, "th") || a.id.localeCompare(b.id));
}

export async function updateRepertoireItem(
  db: Db,
  performerId: string,
  id: string,
  patch: { songKey?: string | null; tags?: string[] },
): Promise<void> {
  const set: Partial<typeof repertoire.$inferInsert> = {};
  if (patch.songKey !== undefined) {
    if (patch.songKey === null) set.songKey = null;
    else {
      let k: string | null;
      try {
        k = cleanText(patch.songKey, 6);
      } catch {
        throw new ValidationError("songKey", "Key longer than 6 characters");
      }
      set.songKey = k;
    }
  }
  if (patch.tags !== undefined) {
    const tags: string[] = [];
    for (const raw of patch.tags) {
      let t: string | null;
      try {
        t = cleanText(raw, 20);
      } catch {
        throw new ValidationError("tags", "Tag longer than 20 characters");
      }
      if (t && !tags.includes(t)) tags.push(t);
    }
    if (tags.length > 5) throw new ValidationError("tags", "At most 5 tags");
    set.tags = tags;
  }
  if (Object.keys(set).length === 0) return;
  await db
    .update(repertoire)
    .set(set)
    .where(and(eq(repertoire.id, id), eq(repertoire.performerId, performerId)));
}

export async function removeRepertoireItem(db: Db, performerId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ songId: repertoire.songId })
      .from(repertoire)
      .where(and(eq(repertoire.id, id), eq(repertoire.performerId, performerId)));
    if (!row) return;
    const mine = tx.select({ id: setlists.id }).from(setlists).where(eq(setlists.performerId, performerId));
    const ids = (await mine).map((s) => s.id);
    if (ids.length > 0) {
      await tx
        .delete(setlistSongs)
        .where(and(eq(setlistSongs.songId, row.songId), inArray(setlistSongs.setlistId, ids)));
    }
    await tx.delete(repertoire).where(eq(repertoire.id, id));
  });
}
