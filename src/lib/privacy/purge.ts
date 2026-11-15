import { and, isNotNull, lt, or } from "drizzle-orm";
import type { Db } from "@/lib/db/types";
import { requests } from "@/lib/db/schema";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Null requester_name and message on requests older than 90 days. Returns rows changed. */
export async function purgeOldPii(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const rows = await db
    .update(requests)
    .set({ requesterName: null, message: null })
    .where(
      and(lt(requests.createdAt, cutoff), or(isNotNull(requests.requesterName), isNotNull(requests.message))),
    )
    .returning({ id: requests.id });
  return rows.length;
}
