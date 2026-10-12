import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { issueOrderViewToken } from "./tokens";

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBaseUrl = process.env.TEST_API_BASE_URL;

it.skipIf(!databaseUrl || !apiBaseUrl || !process.env.CUSTOMER_TOKEN_SECRET)("enforces name, active catalog, and per-order view over HTTP", async () => {
  const dbUrl = new URL(databaseUrl!);
  const appUrl = new URL(apiBaseUrl!);
  if (!["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) ||
      !["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname)) {
    throw new Error("BE-05 HTTP test must use local database and app URLs");
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const tableId = randomUUID();
  const categoryId = randomUUID();
  const sessionId = randomUUID();
  const ownOrderId = randomUUID();
  const otherOrderId = randomUUID();
  const tableToken = randomBytes(32).toString("base64url");
  const base = `${apiBaseUrl}/api/public/tables/${tableToken}`;
  try {
    await client.query("INSERT INTO dining_tables (id, table_number, qr_token) VALUES ($1, $2, $3)",
      [tableId, `BE05-${tableId.slice(0, 8)}`, tableToken]);
    await client.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `BE05-${categoryId}`]);
    await client.query("INSERT INTO menu_items (category_id, name, price_idr, is_available) VALUES ($1, 'Visible dish', 25000, true), ($1, 'Hidden dish', 30000, false)", [categoryId]);
    await client.query("INSERT INTO table_sessions (id, table_id) VALUES ($1, $2)", [sessionId, tableId]);
    for (const [id, name] of [[ownOrderId, "Aulia"], [otherOrderId, "Bima"]]) {
      await client.query(`INSERT INTO orders
        (id, session_id, customer_name, source, client_request_key, request_fingerprint)
        VALUES ($1, $2, $3, 'QR', $4, $5)`,
      [id, sessionId, name, randomUUID(), "a".repeat(64)]);
      await client.query("INSERT INTO order_items (order_id, menu_name_snapshot, unit_price_idr, quantity) VALUES ($1, 'Visible dish', 25000, 1)", [id]);
    }

    expect((await fetch(`${apiBaseUrl}/api/public/tables/not-a-token`)).status).toBe(404);
    const metadata = await (await fetch(base)).json();
    expect(metadata.data).toMatchObject({ tableId, status: "AVAILABLE", requiresName: true });
    expect(metadata.data).not.toHaveProperty("customerName");
    expect((await fetch(`${base}/menu`)).status).toBe(401);
    const missingName = await fetch(`${base}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "   ", expectedCycleNumber: 0 }),
    });
    expect(missingName.status).toBe(422);
    const staleName = await fetch(`${base}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "Aulia", expectedCycleNumber: 1 }),
    });
    expect(staleName.status).toBe(409);
    const named = await fetch(`${base}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: " Aulia ", expectedCycleNumber: 0 }),
    });
    expect(named.status).toBe(200);
    const { guestToken } = (await named.json()).data;
    const catalog = await (await fetch(`${base}/menu?categoryId=${categoryId}`, {
      headers: { Authorization: `Bearer ${guestToken}` },
    })).json();
    expect(catalog.data.categories.flatMap((category: { items: { name: string }[] }) => category.items.map((item) => item.name)))
      .toEqual(["Visible dish"]);
    const moreGuests = await Promise.all(Array.from({ length: 29 }, () => fetch(`${base}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "Aulia", expectedCycleNumber: 0 }),
    })));
    expect(moreGuests.map((response) => response.status)).toEqual(Array(29).fill(200));
    const limited = await fetch(`${base}/guests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "Aulia", expectedCycleNumber: 0 }),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    await client.query("UPDATE dining_tables SET cycle_number = 1 WHERE id = $1", [tableId]);
    const staleGuest = await fetch(`${base}/menu`, {
      headers: { Authorization: `Bearer ${guestToken}` },
    });
    expect(staleGuest.status).toBe(403);

    const ownToken = issueOrderViewToken(ownOrderId, tableId);
    const own = await fetch(`${apiBaseUrl}/api/public/orders/${ownOrderId}`, {
      headers: { Authorization: `Bearer ${ownToken}` },
    });
    expect(own.status).toBe(200);
    expect((await own.json()).data).toMatchObject({ orderId: ownOrderId, customerName: "Aulia" });
    const other = await fetch(`${apiBaseUrl}/api/public/orders/${otherOrderId}`, {
      headers: { Authorization: `Bearer ${ownToken}` },
    });
    expect(other.status).toBe(404);
  } finally {
    await client.query("DELETE FROM order_items WHERE order_id = ANY($1::uuid[])", [[ownOrderId, otherOrderId]]);
    await client.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [[ownOrderId, otherOrderId]]);
    await client.query("DELETE FROM table_sessions WHERE id = $1", [sessionId]);
    await client.query("DELETE FROM menu_items WHERE category_id = $1", [categoryId]);
    await client.query("DELETE FROM categories WHERE id = $1", [categoryId]);
    await client.query("DELETE FROM dining_tables WHERE id = $1", [tableId]);
    await client.end();
  }
}, 30_000);
