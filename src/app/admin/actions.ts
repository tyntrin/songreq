"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { isAdminEmail } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/session";
import { deleteRequest, setSuspended } from "@/lib/admin/service";

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email, process.env)) notFound();
}

export async function setSuspendedAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await setSuspended(getDb(), String(fd.get("performerId") ?? ""), fd.get("suspend") === "1", new Date());
  revalidatePath("/admin");
}

export async function deleteRequestAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await deleteRequest(getDb(), String(fd.get("requestId") ?? ""));
  revalidatePath("/admin");
}
