import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";
import type { Db } from "./types";

export const DEFAULT_PGLITE_DIR = "./.data/pglite";

export function isPglite(url: string | undefined): boolean {
  return !url || url.startsWith("pglite:");
}

export function pgliteDir(url: string | undefined): string {
  const dir = url?.slice("pglite:".length) || DEFAULT_PGLITE_DIR;
  return path.resolve(dir);
}

/** Open a connection for DATABASE_URL (no caching). Returns the db and a closer. */
export function openDb(url: string | undefined = process.env.DATABASE_URL) {
  if (isPglite(url)) {
    const dir = pgliteDir(url);
    mkdirSync(path.dirname(dir), { recursive: true });
    const client = new PGlite(dir);
    return {
      db: drizzlePglite(client, { schema }) as unknown as Db,
      close: () => client.close(),
    };
  }
  const client = postgres(url!);
  return {
    db: drizzlePostgres(client, { schema }) as unknown as Db,
    close: () => client.end(),
  };
}

const globalForDb = globalThis as unknown as { __songRequestDb?: Db };

/** Lazy singleton: nothing connects until first call. */
export function getDb(): Db {
  return (globalForDb.__songRequestDb ??= openDb().db);
}
