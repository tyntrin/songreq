import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { listRepertoire } from "@/lib/songs/repertoire";
import { SongsClient } from "./songs-client";

export const dynamic = "force-dynamic";

export default async function SongsPage() {
  const { performer } = await requireCurrentPerformer();
  const items = await listRepertoire(getDb(), performer.id);
  return <SongsClient items={items} />;
}
