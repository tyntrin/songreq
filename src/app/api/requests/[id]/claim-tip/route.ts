import { getDb } from "@/lib/db/client";
import { readDeviceId } from "@/lib/requests/device";
import { claimTip } from "@/lib/requests/service";

export const dynamic = "force-dynamic";

// Always 204, even when nothing changed, so ids cannot be probed.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deviceId = await readDeviceId();
  if (deviceId) await claimTip(getDb(), id, deviceId, new Date());
  return new Response(null, { status: 204 });
}
