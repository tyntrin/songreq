import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { setlists } from "@/lib/db/schema";
import { readDeviceId } from "@/lib/requests/device";
import { getDeviceStatus } from "@/lib/requests/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = getDb();
  const [sl] = await db
    .select({ performerId: setlists.performerId })
    .from(setlists)
    .where(eq(setlists.publicId, publicId));
  if (!sl) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const deviceId = await readDeviceId();
  const requests = deviceId ? await getDeviceStatus(db, sl.performerId, deviceId, new Date()) : [];
  return NextResponse.json({ requests });
}
