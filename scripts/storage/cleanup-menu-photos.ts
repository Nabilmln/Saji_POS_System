import { loadEnvConfig } from "@next/env";
import { createDatabase } from "../../src/db/connection";
import { cleanupMenuPhotos } from "../../src/lib/menu-photo-cleanup";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Use photos:cleanup with optional --apply");
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is required");
  const { db, pool } = createDatabase(url);
  try {
    const apply = args.includes("--apply");
    console.log(JSON.stringify({ mode: apply ? "apply" : "preview", ...await cleanupMenuPhotos(db, apply) }, null, 2));
  } finally { await pool.end(); }
}

void main().catch(() => {
  console.error("Menu photo cleanup failed. Check database/storage access and retry; no menu records are modified.");
  process.exitCode = 1;
});
