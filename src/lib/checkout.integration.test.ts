import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.TEST_API_BASE_URL;

it.skipIf(!databaseUrl || !apiBaseUrl || !process.env.CUSTOMER_TOKEN_SECRET)(
  "checks out concurrently with price snapshots, cycle guards, and exact idempotent replay", async () => {
    if (!["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl!).hostname) ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(apiBaseUrl!).hostname)) {
      throw new Error("Checkout HTTP test must use a local app and database");
    }
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const tableId = randomUUID();
    const categoryId = randomUUID();
    const menuId = randomUUID();
    const unavailableId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const base = `${apiBaseUrl}/api/public/tables/${token}`;
    const checkout = (guestToken: string, body: object, key?: string) => fetch(`${base}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${guestToken}`,
        ...(key ? { "Idempotency-Key": key } : {}) },
      body: JSON.stringify(body),
    });
    const guest = async (name: string) => {
      const response = await fetch(`${base}/guests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: name, expectedCycleNumber: 0 }),
      });
      expect(response.status).toBe(200);
      return (await response.json()).data.guestToken as string;
    };
    try {
      await client.query("INSERT INTO dining_tables (id, table_number, qr_token) VALUES ($1, $2, $3)",
        [tableId, `BE06-${tableId.slice(0, 8)}`, token]);
      await client.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `BE06-${categoryId}`]);
      await client.query(`INSERT INTO menu_items (id, category_id, name, price_idr, is_available) VALUES
        ($1, $3, 'Snapshot meal', 25000, true), ($2, $3, 'Hidden meal', 10000, false)`,
      [menuId, unavailableId, categoryId]);
      const guestA = await guest("Aulia");
      const guestB = await guest("Bima");
      const bodyA = { expectedCycleNumber: 0, clientRequestKey: randomUUID(), items: [{ menuItemId: menuId, quantity: 2 }] };
      const bodyB = { expectedCycleNumber: 0, clientRequestKey: randomUUID(), items: [{ menuItemId: menuId, quantity: 1 }] };

      expect((await checkout(guestA, { ...bodyA, customerName: "Forged" })).status).toBe(422);
      expect((await checkout(guestA, bodyA, randomUUID())).status).toBe(422);
      expect((await checkout(guestA, { ...bodyA, items: [{ menuItemId: unavailableId, quantity: 1 }] })).status).toBe(409);
      await client.query("UPDATE dining_tables SET status = 'RESERVED' WHERE id = $1", [tableId]);
      expect((await checkout(guestA, bodyA)).status).toBe(409);
      await client.query("UPDATE dining_tables SET status = 'AVAILABLE' WHERE id = $1", [tableId]);

      const [firstA, firstB] = await Promise.all([
        checkout(guestA, bodyA, bodyA.clientRequestKey), checkout(guestB, bodyB, bodyB.clientRequestKey),
      ]);
      expect(firstA.status).toBe(201);
      expect(firstB.status).toBe(201);
      const orderA = (await firstA.json()).data;
      const orderB = (await firstB.json()).data;
      expect(orderA.sessionId).toBe(orderB.sessionId);
      expect(orderA.customerName).toBe("Aulia");
      expect(orderB.customerName).toBe("Bima");
      expect(orderA.items[0]).toMatchObject({ menuName: "Snapshot meal", unitPriceIdr: "25000", lineTotalIdr: "50000" });
      const sessions = await client.query<{ active: string }>(
        "SELECT count(*)::text AS active FROM table_sessions WHERE table_id = $1 AND closed_at IS NULL", [tableId],
      );
      expect(sessions.rows[0].active).toBe("1");

      await client.query("UPDATE menu_items SET is_available = false WHERE id = $1", [menuId]);
      const replay = await checkout(guestA, bodyA, bodyA.clientRequestKey);
      expect(replay.status).toBe(200);
      expect((await replay.json()).data).toEqual(orderA);
      expect((await checkout(guestA, { ...bodyA, items: [{ menuItemId: menuId, quantity: 3 }] })).status).toBe(409);
      expect((await checkout(guestA, { ...bodyA, clientRequestKey: randomUUID() })).status).toBe(409);

      await client.query("UPDATE menu_items SET is_available = true, price_idr = 30000 WHERE id = $1", [menuId]);
      const additional = await checkout(guestA, { ...bodyA, clientRequestKey: randomUUID() });
      expect(additional.status).toBe(201);
      const newOrder = (await additional.json()).data;
      expect(newOrder.sessionId).toBe(orderA.sessionId);
      expect(newOrder.items[0].unitPriceIdr).toBe("30000");
      const snapshot = await client.query<{ unit_price_idr: string }>(
        "SELECT unit_price_idr FROM order_items WHERE order_id = $1", [orderA.orderId],
      );
      expect(snapshot.rows[0].unit_price_idr).toBe("25000");
      await client.query("UPDATE categories SET is_active = false WHERE id = $1", [categoryId]);
      expect((await checkout(guestA, { ...bodyA, clientRequestKey: randomUUID() })).status).toBe(409);
      await client.query("UPDATE categories SET is_active = true WHERE id = $1", [categoryId]);
      await client.query("UPDATE dining_tables SET cycle_number = cycle_number + 1 WHERE id = $1", [tableId]);
      expect((await checkout(guestA, { ...bodyA, clientRequestKey: randomUUID() })).status).toBe(409);
      const orderCount = await client.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM orders WHERE session_id = $1", [orderA.sessionId],
      );
      expect(orderCount.rows[0].total).toBe("3");
      const revision = await client.query<{ bill_revision: string }>(
        "SELECT bill_revision FROM table_sessions WHERE id = $1", [orderA.sessionId],
      );
      expect(revision.rows[0].bill_revision).toBe("4");
    } finally {
      await client.query(`DELETE FROM order_items WHERE order_id IN
        (SELECT o.id FROM orders o JOIN table_sessions s ON s.id = o.session_id WHERE s.table_id = $1)`, [tableId]);
      await client.query("DELETE FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id = $1)", [tableId]);
      await client.query("DELETE FROM table_sessions WHERE table_id = $1", [tableId]);
      await client.query("DELETE FROM menu_items WHERE category_id = $1", [categoryId]);
      await client.query("DELETE FROM categories WHERE id = $1", [categoryId]);
      await client.query("DELETE FROM dining_tables WHERE id = $1", [tableId]);
      await client.end();
    }
  }, 45_000,
);
