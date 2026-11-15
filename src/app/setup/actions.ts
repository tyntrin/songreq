"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { createPerformer, listMyPerformers } from "@/lib/performers/service";
import { isValidPromptPay, type PromptPayType } from "@/lib/promptpay/promptpay";
import { isOwnAvatarUrl } from "@/lib/storage";
import { ValidationError, cleanText } from "@/lib/validation/text";

export type SetupState = {
  errors?: { displayName?: string; promptpayId?: string };
  values?: { displayName: string; promptpayType: PromptPayType; promptpayId: string };
};

export async function createPerformerAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const user = await requireUser();
  const db = getDb();

  const rawName = String(formData.get("displayName") ?? "");
  const promptpayType: PromptPayType =
    formData.get("promptpayType") === "national_id" ? "national_id" : "phone";
  const promptpayId = String(formData.get("promptpayId") ?? "");
  const rawAvatar = String(formData.get("avatarUrl") ?? "");
  const avatarUrl = rawAvatar && isOwnAvatarUrl(rawAvatar) ? rawAvatar : null;
  const values = { displayName: rawName, promptpayType, promptpayId };

  // Already set up (e.g. double submit): do not create a second page.
  if ((await listMyPerformers(db, user.id)).length > 0) redirect("/dashboard/requests");

  const errors: NonNullable<SetupState["errors"]> = {};
  let name: string | null = null;
  try {
    name = cleanText(rawName, 60);
  } catch {
    errors.displayName = "ชื่อยาวเกิน 60 ตัวอักษร";
  }
  if (!name && !errors.displayName) errors.displayName = "ใส่ชื่อวงหรือชื่อศิลปิน";
  if (!isValidPromptPay(promptpayType, promptpayId)) errors.promptpayId = "เลขพร้อมเพย์ไม่ถูกต้อง";
  if (errors.displayName || errors.promptpayId) return { errors, values };

  try {
    await createPerformer(db, user.id, { displayName: rawName, promptpayType, promptpayId, avatarUrl });
  } catch (e) {
    if (e instanceof ValidationError) {
      return {
        errors: e.field === "displayName" ? { displayName: "ชื่อไม่ถูกต้อง" } : { promptpayId: "เลขพร้อมเพย์ไม่ถูกต้อง" },
        values,
      };
    }
    throw e;
  }
  redirect("/dashboard/songs");
}
