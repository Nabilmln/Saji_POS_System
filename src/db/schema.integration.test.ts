import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

const testUrl = process.env.TEST_DATABASE_URL;

it.skipIf(!testUrl)("enforces table status, one active session, and one payment per session", async () => {
  const url = new URL(testUrl!);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("TEST_DATABASE_URL must point to local PostgreSQL");
  }

  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const userId = randomUUID();
    const tableNumber = `T-${randomUUID().slice(0, 8)}`;
    await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1)', [userId]);
    await client.query(
      "INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'Test cashier', 'CASHIER')",
      [userId],
    );
    const table = await client.query<{ id: string }>(
      "INSERT INTO dining_tables (table_number, qr_token) VALUES ($1, $2) RETURNING id",
      [tableNumber, randomUUID()],
    );
    const tableId = table.rows[0].id;
    const session = await client.query<{ id: string }>(
      "INSERT INTO table_sessions (table_id) VALUES ($1) RETURNING id",
      [tableId],
    );
    const sessionId = session.rows[0].id;

    await client.query("SAVEPOINT duplicate_session");
    await expect(
      client.query("INSERT INTO table_sessions (table_id) VALUES ($1)", [tableId]),
    ).rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate_session");

    await client.query("SAVEPOINT invalid_status");
    await expect(
      client.query("UPDATE dining_tables SET status = 'CLEANING' WHERE id = $1", [tableId]),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT invalid_status");

    const paymentSql = `INSERT INTO payments
      (session_id, cashier_user_id, idempotency_key, subtotal_idr,
       discount_enabled, configured_discount_idr, discount_applied_idr,
       tax_enabled, tax_rate_bps, tax_amount_idr, grand_total_idr,
       cash_received_idr, change_idr, session_revision, settings_version, receipt_snapshot)
      VALUES ($1, $2, $3, 0, false, 0, 0, false, 0, 0, 0, 0, 0, 1, 1, '{}'::jsonb)`;
    await client.query(paymentSql, [sessionId, userId, randomUUID()]);
    await client.query("SAVEPOINT duplicate_payment");
    await expect(
      client.query(paymentSql, [sessionId, userId, randomUUID()]),
    ).rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate_payment");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
