import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { isPglite, openDb } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  const { db, close } = openDb(url);
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  try {
    if (isPglite(url)) await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder });
    else await migratePostgres(db as unknown as PostgresJsDatabase, { migrationsFolder });
    console.log("migrations applied");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
