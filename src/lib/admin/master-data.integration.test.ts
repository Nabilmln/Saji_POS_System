import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

const testUrl = process.env.TEST_DATABASE_URL;

it.skipIf(!testUrl)("keeps QR tokens unique, archives menus, and rejects stale settings writes", async () => {
  const url = new URL(testUrl!);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("TEST_DATABASE_URL must point to local PostgreSQL");
  }
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const userId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tableNumber = `BE04-${randomUUID().slice(0, 8)}`;
    await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1)', [userId]);
    await client.query("INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'Admin', 'ADMIN')", [userId]);
    await client.query("INSERT INTO dining_tables (table_number, qr_token) VALUES ($1, $2)", [tableNumber, token]);
    await client.query("SAVEPOINT duplicate_token");
    await expect(client.query("INSERT INTO dining_tables (table_number, qr_token) VALUES ($1, $2)", [`${tableNumber}-2`, token]))
      .rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate_token");

    const categoryId = randomUUID();
    await client.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `BE04-${categoryId}`]);
    const menu = await client.query<{ id: string }>(
      "INSERT INTO menu_items (category_id, name, price_idr) VALUES ($1, 'Tea', 25000) RETURNING id", [categoryId],
    );
    await client.query("UPDATE menu_items SET is_available = false WHERE id = $1", [menu.rows[0].id]);
    const archived = await client.query<{ is_available: boolean; archived_at: Date }>(
      "UPDATE menu_items SET archived_at = now() WHERE id = $1 RETURNING is_available, archived_at", [menu.rows[0].id],
    );
    expect(archived.rows[0].is_available).toBe(false);
    expect(archived.rows[0].archived_at).toBeTruthy();

    const original = await client.query<{ version: string }>("SELECT version FROM store_settings WHERE id = 1");
    const expected = original.rows[0].version;
    const update = `UPDATE store_settings SET version = version + 1, discount_enabled = false,
      updated_by_user_id = $2 WHERE id = 1 AND version = $1 RETURNING version`;
    const first = await client.query<{ version: string }>(update, [expected, userId]);
    const stale = await client.query(update, [expected, userId]);
    expect(first.rows[0].version).toBe((BigInt(expected) + 1n).toString());
    expect(stale.rowCount).toBe(0);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
