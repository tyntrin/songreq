"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import {
  createSetlist,
  deleteSetlist,
  renameSetlist,
  setSetlistSongs,
} from "@/lib/setlists/service";
import { ValidationError } from "@/lib/validation/text";

export type SetlistActionResult = { ok: true } | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  name: "ชื่อ setlist ต้องมี 1–40 ตัวอักษร",
  setlist: "ลบไม่ได้ ต้องมี setlist อย่างน้อย 1 อัน",
  songIds: "เลือกได้เฉพาะเพลงในคลังของคุณ",
};

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ValidationError) {
    return { ok: false, error: MESSAGES[e.field] ?? "ข้อมูลไม่ถูกต้อง" };
  }
  throw e;
}

export async function createSetlistAction(name: string): Promise<SetlistActionResult> {
  const { performer } = await requireCurrentPerformer();
  let id: string;
  try {
    ({ id } = await createSetlist(getDb(), performer.id, String(name ?? "")));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/setlists");
  redirect(`/dashboard/setlists/${id}`);
}

export async function saveSetlistAction(
  setlistId: string,
  name: string,
  songIds: string[],
): Promise<SetlistActionResult> {
  const { performer } = await requireCurrentPerformer();
  const db = getDb();
  try {
    await renameSetlist(db, performer.id, String(setlistId), String(name ?? ""));
    await setSetlistSongs(db, performer.id, String(setlistId), songIds.map(String));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/setlists");
  revalidatePath(`/dashboard/setlists/${setlistId}`);
  return { ok: true };
}

export async function deleteSetlistAction(setlistId: string): Promise<SetlistActionResult> {
  const { performer } = await requireCurrentPerformer();
  try {
    await deleteSetlist(getDb(), performer.id, String(setlistId));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/setlists");
  redirect("/dashboard/setlists");
}
