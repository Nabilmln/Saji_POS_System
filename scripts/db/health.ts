import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { createDatabase } from "../../src/db/connection";

loadEnvConfig(process.cwd());

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const { db, pool } = createDatabase(connectionString);
  try {
    await db.execute(sql`SELECT 1`);
    console.log("Database connection OK");
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
