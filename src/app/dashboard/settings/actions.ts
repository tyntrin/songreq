"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/app-url";
import { PERFORMER_COOKIE, requireCurrentPerformer } from "@/lib/performers/current";
import { ForbiddenError } from "@/lib/performers/errors";
import { createInvite } from "@/lib/performers/invites";
import { listMyPerformers, removeMember, updatePerformer } from "@/lib/performers/service";
import { isValidPromptPay, type PromptPayType } from "@/lib/promptpay/promptpay";
import { saveAvatar } from "@/lib/storage";
import { ValidationError, cleanText } from "@/lib/validation/text";

export type AvatarResult = { url?: string; error?: string };

async function readAvatar(fd: FormData): Promise<AvatarResult> {
  const f = fd.get("avatar");
  if (!(f instanceof File) || f.size === 0) return { error: "ไม่พบไฟล์" };
  try {
    const url = await saveAvatar({ bytes: new Uint8Array(await f.arrayBuffer()), contentType: f.type });
    return { url };
  } catch (e) {
    if (e instanceof ValidationError) return { error: "รูปไม่ถูกต้อง ใช้ JPG, PNG หรือ WebP ไม่เกิน 2 MB" };
    throw e;
  }
}

/** Setup page: the performer does not exist yet; just store the file and return the URL. */
export async function storeAvatarAction(fd: FormData): Promise<AvatarResult> {
  await requireUser();
  return readAvatar(fd);
}

export async function uploadAvatarAction(fd: FormData): Promise<AvatarResult> {
  const { user, performer } = await requireCurrentPerformer();
  const r = await readAvatar(fd);
  if (!r.url) return r;
  await updatePerformer(getDb(), performer.id, user.id, { avatarUrl: r.url });
  revalidatePath("/dashboard/settings");
  return r;
}

export type ProfileState = { ok?: boolean; errors?: { displayName?: string; promptpayId?: string } };

export async function updateProfileAction(_prev: ProfileState, fd: FormData): Promise<ProfileState> {
  const { user, performer } = await requireCurrentPerformer();
  const errors: NonNullable<ProfileState["errors"]> = {};
  const rawName = String(fd.get("displayName") ?? "");
  let name: string | null = null;
  try {
    name = cleanText(rawName, 60);
  } catch {
    errors.displayName = "ชื่อยาวเกิน 60 ตัวอักษร";
  }
  if (!name && !errors.displayName) errors.displayName = "ใส่ชื่อวงหรือชื่อศิลปิน";

  const patch: Parameters<typeof updatePerformer>[3] = {};
  if (name) patch.displayName = name;
  if (performer.role === "owner") {
    const type: PromptPayType = fd.get("promptpayType") === "national_id" ? "national_id" : "phone";
    const id = String(fd.get("promptpayId") ?? "").trim();
    // Blank means "unchanged": the stored number is never sent to the client.
    if (id !== "") {
      if (!isValidPromptPay(type, id)) errors.promptpayId = "เลขพร้อมเพย์ไม่ถูกต้อง";
      else {
        patch.promptpayType = type;
        patch.promptpayId = id;
      }
    }
  }
  if (errors.displayName || errors.promptpayId) return { errors };
  try {
    await updatePerformer(getDb(), performer.id, user.id, patch);
  } catch (e) {
    if (e instanceof ValidationError) return { errors: { displayName: "ข้อมูลไม่ถูกต้อง" } };
    throw e;
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function setAcceptingAction(accepting: boolean): Promise<void> {
  const { user, performer } = await requireCurrentPerformer();
  await updatePerformer(getDb(), performer.id, user.id, { acceptingRequests: Boolean(accepting) });
  revalidatePath("/dashboard/settings");
}

export async function createInviteAction(): Promise<{ url?: string; error?: string }> {
  const { user, performer } = await requireCurrentPerformer();
  try {
    const token = await createInvite(getDb(), performer.id, user.id);
    return { url: `${await getAppUrl()}/invite/${token}` };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "เฉพาะเจ้าของเพจที่เชิญสมาชิกได้" };
    throw e;
  }
}

export async function removeMemberAction(memberUserId: string): Promise<void> {
  const { user, performer } = await requireCurrentPerformer();
  if (memberUserId === user.id) return;
  try {
    await removeMember(getDb(), performer.id, user.id, String(memberUserId));
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
  }
  revalidatePath("/dashboard/settings");
}

export async function switchPerformerAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("performerId") ?? "");
  const mine = await listMyPerformers(getDb(), user.id);
  if (mine.some((p) => p.id === id)) {
    (await cookies()).set(PERFORMER_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/dashboard/requests");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
