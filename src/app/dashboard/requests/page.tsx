import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { getFeedPayload } from "@/lib/requests/feed";
import { Monitor } from "./Monitor";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const { performer } = await requireCurrentPerformer();
  const now = new Date();
  const initial = await getFeedPayload(getDb(), performer.id, now);
  return <Monitor initial={initial} serverNow={now.getTime()} />;
}
