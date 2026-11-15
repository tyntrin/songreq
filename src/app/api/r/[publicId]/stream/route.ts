import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { setlists } from "@/lib/db/schema";
import { deviceChannel, performerChannel, type BusEvent } from "@/lib/realtime/bus";
import { readDeviceId } from "@/lib/requests/device";
import { sseStream } from "@/lib/realtime/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Customers only need to know "something changed, refetch". Never forward request.created
// (it is about other customers); events carry no data beyond their type.
const FORWARD = new Set<BusEvent["type"]>(["request.updated", "items.seen"]);

export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const deviceId = await readDeviceId();
  if (!deviceId) return new Response(null, { status: 204 });
  const [sl] = await getDb()
    .select({ performerId: setlists.performerId })
    .from(setlists)
    .where(eq(setlists.publicId, publicId));
  if (!sl) return new Response(null, { status: 404 });
  return sseStream({
    channels: [deviceChannel(sl.performerId, deviceId), performerChannel(sl.performerId)],
    signal: req.signal,
    prelude: ": ok\n\n",
    filter: (e) => FORWARD.has(e.type),
  });
}
