/** Dev-only credentials login: impossible when NODE_ENV=production. */
export function isDevLoginEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.AUTH_DEV_LOGIN === "true" && env.NODE_ENV !== "production";
}

/** Trim + lowercase + basic format check; null if invalid. */
export function normalizeDevEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
