"use server";

import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { blockDevice, hideRequest } from "@/lib/requests/feed";

export async function hideRequestsAction(requestIds: string[]): Promise<void> {
  const { user, performer } = await requireCurrentPerformer();
  for (const id of requestIds.slice(0, 200)) {
    await hideRequest(getDb(), performer.id, user.id, String(id));
  }
}

export async function blockDeviceAction(deviceId: string): Promise<void> {
  const { user, performer } = await requireCurrentPerformer();
  await blockDevice(getDb(), performer.id, user.id, String(deviceId));
}
