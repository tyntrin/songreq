import { getCurrentPerformerOrNull } from "@/lib/performers/current";
import { performerChannel } from "@/lib/realtime/bus";
import { sseStream } from "@/lib/realtime/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const cur = await getCurrentPerformerOrNull();
  if (!cur.signedIn) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!cur.context) return Response.json({ error: "forbidden" }, { status: 403 });
  return sseStream({
    channels: [performerChannel(cur.context.performer.id)],
    signal: req.signal,
    prelude: ": ok\n\n",
  });
}
