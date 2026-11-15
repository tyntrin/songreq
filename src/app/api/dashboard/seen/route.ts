import { getDb } from "@/lib/db/client";
import { getCurrentPerformerOrNull } from "@/lib/performers/current";
import { markSeen } from "@/lib/requests/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const cur = await getCurrentPerformerOrNull();
  if (!cur.signedIn) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!cur.context) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { itemIds?: unknown } | null;
  const ids = body?.itemIds;
  if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === "string")) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  await markSeen(getDb(), cur.context.performer.id, ids as string[], new Date());
  return new Response(null, { status: 204 });
}
