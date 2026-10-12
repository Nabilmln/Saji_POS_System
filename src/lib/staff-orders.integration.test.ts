import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

const dbUrl = process.env.TEST_DATABASE_URL;
const baseUrl = process.env.TEST_API_BASE_URL;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

it.skipIf(!dbUrl || !baseUrl || !email || !password)(
  "handles cashier manual order, inbox, confirm, and per-line served transitions", async () => {
    if (!["localhost", "127.0.0.1", "::1"].includes(new URL(dbUrl!).hostname) ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(baseUrl!).hostname)) {
      throw new Error("Staff HTTP test must use a local app and database");
    }
    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(signIn.status).toBe(200);
    const { user } = await signIn.json();
    const cookie = signIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const tableId = randomUUID();
    const categoryId = randomUUID();
    const menuIds = [randomUUID(), randomUUID(), randomUUID()];
    let authUserCreated = false;
    let profileCreated = false;
    const call = (path: string, method = "GET", body?: object, key?: string) => fetch(`${baseUrl}/api/staff${path}`, {
      method,
      headers: { Cookie: cookie, Origin: baseUrl!, "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      const inserted = await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [user.id]);
      authUserCreated = inserted.rowCount === 1;
      const profile = await client.query(
        "INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'BE07 test', 'CASHIER') ON CONFLICT DO NOTHING RETURNING user_id",
        [user.id],
      );
      profileCreated = profile.rowCount === 1;
      await client.query("INSERT INTO dining_tables (id, table_number, qr_token) VALUES ($1, $2, $3)",
        [tableId, `BE07-${tableId.slice(0, 8)}`, randomBytes(32).toString("base64url")]);
      await client.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `BE07-${categoryId}`]);
      for (const id of menuIds) {
        await client.query("INSERT INTO menu_items (id, category_id, name, price_idr) VALUES ($1, $2, $3, 10000)",
          [id, categoryId, `Meal ${id.slice(0, 4)}`]);
      }
      const staffMenu = await call("/menus");
      expect(staffMenu.status).toBe(200);
      expect((await staffMenu.json()).data.categories.find((category: { id: string }) => category.id === categoryId).items)
        .toEqual(expect.arrayContaining(menuIds.map((id) => expect.objectContaining({ id, priceIdr: "10000" }))));
      const key = randomUUID();
      const body = {
        clientRequestKey: key, customerName: "Cashier customer",
        items: menuIds.map((menuItemId) => ({ menuItemId, quantity: 1 })),
      };
      expect((await call(`/tables/${tableId}/orders`, "POST", body)).status).toBe(422);
      const created = await call(`/tables/${tableId}/orders`, "POST", body, key);
      expect(created.status).toBe(201);
      const order = (await created.json()).data;
      expect(order).toMatchObject({ source: "MANUAL", status: "PENDING", customerName: body.customerName });
      expect((await call(`/tables/${tableId}/orders`, "POST", body, key)).status).toBe(200);
      expect((await call(`/tables/${tableId}/orders`, "POST",
        { ...body, customerName: "Changed" }, key)).status).toBe(409);
      const inbox = await call(`/orders?tableId=${tableId}`);
      expect(inbox.status).toBe(200);
      expect((await inbox.json()).data[0]).toMatchObject({ id: order.orderId, itemCount: 3, status: "PENDING" });
      const table = await call(`/tables/${tableId}`);
      expect(table.status).toBe(200);
      expect((await table.json()).data.bill.grandTotalIdr).toBe("30000");
      const overview = await call(`/tables?status=OCCUPIED&q=BE07`);
      expect(overview.status).toBe(200);
      expect((await overview.json()).data.find((row: { id: string }) => row.id === tableId))
        .toMatchObject({ activeOrderCount: 1, pendingOrderCount: 1, grandTotalIdr: "30000" });
      const confirm = await call(`/orders/${order.orderId}/confirm`, "POST", {});
      expect(confirm.status).toBe(200);
      expect((await confirm.json()).data.status).toBe("PREPARING");
      const replayAfterConfirm = await call(`/tables/${tableId}/orders`, "POST", body, key);
      expect(replayAfterConfirm.status).toBe(200);
      expect((await replayAfterConfirm.json()).data).toEqual(order);
      expect((await call(`/orders/${order.orderId}/confirm`, "POST", {})).status).toBe(409);
      expect((await call(`/order-items/${order.items[0].id}/served`, "PATCH", { served: false })).status).toBe(422);
      for (const [index, item] of order.items.entries()) {
        const served = await call(`/order-items/${item.id}/served`, "PATCH", { served: true });
        expect(served.status).toBe(200);
        expect((await served.json()).data).toMatchObject({
          orderStatus: index === 2 ? "SERVED" : "PREPARING",
          billRevision: String(3 + index),
        });
      }
      expect((await call(`/order-items/${order.items[0].id}/served`, "PATCH", { served: true })).status).toBe(409);
      const final = await call(`/tables/${tableId}`);
      expect((await final.json()).data.orders[0].status).toBe("SERVED");
    } finally {
      await client.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id = $1))", [tableId]);
      await client.query("DELETE FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id = $1)", [tableId]);
      await client.query("DELETE FROM table_sessions WHERE table_id = $1", [tableId]);
      await client.query("DELETE FROM menu_items WHERE category_id = $1", [categoryId]);
      await client.query("DELETE FROM categories WHERE id = $1", [categoryId]);
      await client.query("DELETE FROM dining_tables WHERE id = $1", [tableId]);
      if (profileCreated) await client.query("DELETE FROM staff_profiles WHERE user_id = $1", [user.id]);
      if (authUserCreated) await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [user.id]);
      await client.end();
      await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: "POST", headers: { Cookie: cookie, Origin: baseUrl!, "Content-Type": "application/json" },
        body: "{}",
      });
    }
  }, 60_000,
);
