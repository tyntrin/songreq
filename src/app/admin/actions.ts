"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { isAdminEmail } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/session";
import { deleteRequest, setSuspended } from "@/lib/admin/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email, process.env)) notFound();
}

export async function setSuspendedAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("performerId") ?? "");
  if (!UUID.test(id)) return;
  await setSuspended(getDb(), id, fd.get("suspend") === "1", new Date());
  revalidatePath("/admin");
}

export async function deleteRequestAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("requestId") ?? "");
  if (!UUID.test(id)) return;
  await deleteRequest(getDb(), id);
  revalidatePath("/admin");
}
