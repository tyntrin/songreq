import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { repertoire, songs } from "@/lib/db/schema";
import { getCurrentPerformerOrNull } from "@/lib/performers/current";
import { UpstreamError, searchItunes } from "@/lib/songs/itunes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cur = await getCurrentPerformerOrNull();
  if (!cur.signedIn) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!cur.context) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const hits = await searchItunes(q);
    const mine = await getDb()
      .select({ trackId: songs.itunesTrackId })
      .from(repertoire)
      .innerJoin(songs, eq(songs.id, repertoire.songId))
      .where(eq(repertoire.performerId, cur.context.performer.id));
    const have = new Set(mine.map((r) => r.trackId));
    return NextResponse.json({
      hits: hits.map((h) => ({ ...h, inRepertoire: have.has(String(h.itunesTrackId)) })),
    });
  } catch (e) {
    if (e instanceof UpstreamError) {
      return NextResponse.json({ error: "search_unavailable" }, { status: 502 });
    }
    throw e;
  }
}
