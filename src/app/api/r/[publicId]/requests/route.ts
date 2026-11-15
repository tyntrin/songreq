import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getOrSetDeviceId } from "@/lib/requests/device";
import { clientIp, mapErrorToResponse } from "@/lib/requests/http";
import { createRequest } from "@/lib/requests/service";
import { parseRequestInput } from "@/lib/validation/request-input";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid", field: "body" }, { status: 400 });
  }
  try {
    const input = parseRequestInput(body);
    const deviceId = await getOrSetDeviceId();
    const result = await createRequest(
      getDb(),
      { publicId, deviceId, ip: clientIp(req.headers), now: new Date() },
      input,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return mapErrorToResponse(e);
  }
}
