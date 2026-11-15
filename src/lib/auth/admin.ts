export function isAdminEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}
