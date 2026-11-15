import { openDb } from "../src/lib/db/client";
import { purgeOldPii } from "../src/lib/privacy/purge";

async function main() {
  const { db, close } = openDb();
  try {
    const n = await purgeOldPii(db, new Date());
    console.log(`purged PII from ${n} request(s)`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
