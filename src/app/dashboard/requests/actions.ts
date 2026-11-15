"use server";

import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { blockDeviceByRequest, hideItems } from "@/lib/requests/feed";

/** "ซ่อนการ์ดนี้": hides only this card's items (other songs and tips of the same requests stay). */
export async function hideItemsAction(itemIds: string[]): Promise<void> {
  const { user, performer } = await requireCurrentPerformer();
  if (!Array.isArray(itemIds)) return;
  await hideItems(getDb(), performer.id, user.id, itemIds.slice(0, 500).map(String));
}

/** Blocks the device behind a request; the device id is resolved server-side. */
export async function blockDeviceAction(requestId: string): Promise<void> {
  const { user, performer } = await requireCurrentPerformer();
  await blockDeviceByRequest(getDb(), performer.id, user.id, String(requestId));
}
