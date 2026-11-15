import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { setlistSongs } from "@/lib/db/schema";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { listSetlists } from "@/lib/setlists/service";
import { listRepertoire } from "@/lib/songs/repertoire";
import { EditSetlist } from "./EditSetlist";

export const dynamic = "force-dynamic";

export default async function EditSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { performer } = await requireCurrentPerformer();
  const db = getDb();
  const lists = await listSetlists(db, performer.id, new Date());
  const current = lists.find((l) => l.id === id);
  if (!current) notFound();

  const [repertoire, members] = await Promise.all([
    listRepertoire(db, performer.id),
    db
      .select({ songId: setlistSongs.songId })
      .from(setlistSongs)
      .where(eq(setlistSongs.setlistId, id))
      .orderBy(asc(setlistSongs.position)),
  ]);
  const order = new Map(members.map((m, i) => [m.songId, i]));
  // Members first in setlist order, then the rest (already sorted by title).
  const inList = repertoire
    .filter((r) => order.has(r.songId))
    .sort((a, b) => order.get(a.songId)! - order.get(b.songId)!);
  const rest = repertoire.filter((r) => !order.has(r.songId));
  const items = [...inList, ...rest].map((r) => ({
    songId: r.songId,
    title: r.title,
    artist: r.artist,
    checked: order.has(r.songId),
  }));

  return (
    <main className="flex flex-col gap-4 px-4 pt-[18px]">
      <Link href="/dashboard/setlists" className="flex min-h-11 items-center text-[14px] font-semibold text-accent">
        ← Setlist และ QR
      </Link>
      <EditSetlist
        setlistId={current.id}
        initialName={current.name}
        items={items}
        canDelete={lists.length > 1}
      />
    </main>
  );
}
