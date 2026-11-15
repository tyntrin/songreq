import { getDb } from "@/lib/db/client";
import { getCurrentPerformerOrNull } from "@/lib/performers/current";
import { getFeedPayload } from "@/lib/requests/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const cur = await getCurrentPerformerOrNull();
  if (!cur.signedIn) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!cur.context) return Response.json({ error: "forbidden" }, { status: 403 });
  const setlist = new URL(req.url).searchParams.get("setlist");
  const payload = await getFeedPayload(getDb(), cur.context.performer.id, new Date(), setlist);
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
