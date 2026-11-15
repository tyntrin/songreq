"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import {
  addCustomSong,
  addItunesSong,
  removeRepertoireItem,
  updateRepertoireItem,
  type RepertoireItem,
} from "@/lib/songs/repertoire";
import { ValidationError } from "@/lib/validation/text";

export type ActionResult<T = undefined> =
  | { ok: true; item?: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ValidationError) {
    const msg: Record<string, string> = {
      title: "ชื่อเพลงต้องมี 1–120 ตัวอักษร",
      artist: "ชื่อศิลปินต้องมี 1–120 ตัวอักษร",
      songKey: "คีย์ยาวได้ไม่เกิน 6 ตัวอักษร",
      tags: "แท็กได้ไม่เกิน 5 อัน อันละไม่เกิน 20 ตัวอักษร",
    };
    return { ok: false, error: msg[e.field] ?? "ข้อมูลไม่ถูกต้อง" };
  }
  throw e;
}

export async function addItunesSongAction(hit: {
  itunesTrackId: number;
  title: string;
  artist: string;
}): Promise<ActionResult<RepertoireItem>> {
  const { performer } = await requireCurrentPerformer();
  try {
    const item = await addItunesSong(getDb(), performer.id, {
      itunesTrackId: Number(hit.itunesTrackId),
      title: String(hit.title),
      artist: String(hit.artist),
    });
    revalidatePath("/dashboard/songs");
    return { ok: true, item };
  } catch (e) {
    return fail(e);
  }
}

export async function addCustomSongAction(input: {
  title: string;
  artist: string;
}): Promise<ActionResult<RepertoireItem>> {
  const { user, performer } = await requireCurrentPerformer();
  try {
    const item = await addCustomSong(getDb(), performer.id, user.id, {
      title: String(input.title ?? ""),
      artist: String(input.artist ?? ""),
    });
    revalidatePath("/dashboard/songs");
    return { ok: true, item };
  } catch (e) {
    return fail(e);
  }
}

export async function updateRepertoireItemAction(
  id: string,
  patch: { songKey: string | null; tags: string[] },
): Promise<ActionResult> {
  const { performer } = await requireCurrentPerformer();
  try {
    await updateRepertoireItem(getDb(), performer.id, String(id), {
      songKey: patch.songKey === null ? null : String(patch.songKey),
      tags: Array.isArray(patch.tags) ? patch.tags.map(String) : [],
    });
    revalidatePath("/dashboard/songs");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeRepertoireItemAction(id: string): Promise<ActionResult> {
  const { performer } = await requireCurrentPerformer();
  await removeRepertoireItem(getDb(), performer.id, String(id));
  revalidatePath("/dashboard/songs");
  return { ok: true };
}
