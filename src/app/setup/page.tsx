import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { listMyPerformers } from "@/lib/performers/service";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireUser();
  if ((await listMyPerformers(getDb(), user.id)).length > 0) redirect("/dashboard/requests");
  return <SetupForm />;
}
