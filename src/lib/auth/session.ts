import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireUser(): Promise<{
  id: string;
  email: string | null;
  name: string | null;
}> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect("/login");
  return { id: user.id, email: user.email ?? null, name: user.name ?? null };
}
