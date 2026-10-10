import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { z } from "zod";

loadEnvConfig(process.cwd());

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required");
  const userId = z.uuid().parse(process.env.BOOTSTRAP_ADMIN_USER_ID);
  const displayName = z.string().trim().min(1).max(120).parse(process.env.BOOTSTRAP_ADMIN_NAME);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(3303)");
    const existingAdmin = await client.query("SELECT 1 FROM staff_profiles WHERE role = 'ADMIN' LIMIT 1");
    if (existingAdmin.rowCount) throw new Error("An admin profile already exists");
    const user = await client.query('SELECT 1 FROM neon_auth."user" WHERE id = $1', [userId]);
    if (!user.rowCount) throw new Error("Auth user does not exist; create it through Neon Auth first");
    await client.query(
      "INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, $2, 'ADMIN')",
      [userId, displayName],
    );
    await client.query("COMMIT");
    console.log("First admin profile created");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
