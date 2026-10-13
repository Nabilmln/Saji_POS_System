import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

const dbUrl = process.env.TEST_DATABASE_URL;
const baseUrl = process.env.TEST_API_BASE_URL;
const email = process.env.TEST_CASHIER_EMAIL;
const password = process.env.TEST_CASHIER_PASSWORD;

it.skipIf(!dbUrl || !baseUrl || !email || !password)(
  "voids with audit, closes ALL_VOID, and pays one immutable live bill", async () => {
    if (!["localhost", "127.0.0.1", "::1"].includes(new URL(dbUrl!).hostname) ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(baseUrl!).hostname)) {
      throw new Error("Settlement test must use a local app and database");
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
    const menuIds = [randomUUID(), randomUUID()];
    const token = randomBytes(32).toString("base64url");
    let authUserCreated = false;
    let profileCreated = false;
    let settingsBefore: Record<string, unknown> | undefined;
    const call = (path: string, method = "GET", body?: object, key?: string) => fetch(`${baseUrl}/api/staff${path}`, {
      method,
      headers: { Cookie: cookie, Origin: baseUrl!, "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const manual = async (name: string) => {
      const key = randomUUID();
      const response = await call(`/tables/${tableId}/orders`, "POST", {
        clientRequestKey: key, customerName: name,
        items: menuIds.map((menuItemId) => ({ menuItemId, quantity: 1 })),
      }, key);
      expect(response.status).toBe(201);
      return (await response.json()).data;
    };
    const pay = (sessionId: string, quote: { sessionRevision: string; settingsVersion: string },
      cashReceivedIdr: string, key = randomUUID()) => call(`/table-sessions/${sessionId}/payments`, "POST", {
      idempotencyKey: key, expectedSessionRevision: quote.sessionRevision,
      expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr,
    }, key);
    try {
      const inserted = await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [user.id]);
      authUserCreated = inserted.rowCount === 1;
      const profile = await client.query(
        "INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'Settlement test', 'CASHIER') ON CONFLICT DO NOTHING RETURNING user_id",
        [user.id],
      );
      profileCreated = profile.rowCount === 1;
      const settings = await client.query("SELECT discount_enabled, discount_amount_idr, tax_enabled, tax_rate_bps FROM store_settings WHERE id = 1");
      settingsBefore = settings.rows[0];
      await client.query("INSERT INTO dining_tables (id, table_number, qr_token) VALUES ($1, $2, $3)",
        [tableId, `BE09-${tableId.slice(0, 8)}`, token]);
      await client.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `BE09-${categoryId}`]);
      await client.query("INSERT INTO menu_items (id, category_id, name, price_idr) VALUES ($1, $2, 'Meal A', 100000), ($3, $2, 'Meal B', 50000)",
        [menuIds[0], categoryId, menuIds[1]]);

      const voidOrder = await manual("Void customer");
      expect((await fetch(`${baseUrl}/api/public/orders/${voidOrder.orderId}/void`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      })).status).toBe(404);
      expect((await call(`/orders/${voidOrder.orderId}/confirm`, "POST", {})).status).toBe(200);
      expect((await call(`/order-items/${voidOrder.items[0].id}/served`, "PATCH", { served: true })).status).toBe(200);
      const customerVoid = await call(`/order-items/${voidOrder.items[0].id}/void`, "POST", {
        reasonType: "CUSTOMER_REQUEST", reasonDetail: "Customer changed mind",
      });
      expect(customerVoid.status).toBe(409);
      expect((await customerVoid.json()).error.code).toBe("ITEM_ALREADY_SERVED");
      expect((await call(`/order-items/${voidOrder.items[0].id}/void`, "POST", {
        reasonType: "EMPLOYEE_ERROR", reasonDetail: "Wrong table served by employee",
      })).status).toBe(200);
      expect((await call(`/order-items/${voidOrder.items[0].id}/void`, "POST", {
        reasonType: "EMPLOYEE_ERROR", reasonDetail: "Wrong table served by employee",
      })).status).toBe(409);
      const partialBill = (await (await call(`/table-sessions/${voidOrder.sessionId}/bill`)).json()).data;
      expect((await call(`/table-sessions/${voidOrder.sessionId}/close-all-void`, "POST", {
        expectedSessionRevision: partialBill.sessionRevision, reason: "One item still remains",
      })).status).toBe(409);
      const lastVoid = await call(`/order-items/${voidOrder.items[1].id}/void`, "POST", {
        reasonType: "CUSTOMER_REQUEST", reasonDetail: "Customer cancelled this item",
      });
      expect(lastVoid.status).toBe(200);
      expect((await lastVoid.json()).data.orderVoided).toBe(true);
      const audit = await client.query("SELECT action, reason FROM audit_events WHERE table_id = $1 ORDER BY created_at", [tableId]);
      expect(audit.rows.filter((row) => row.action === "ORDER_ITEM_VOIDED")).toHaveLength(2);
      const voidQuote = await call(`/table-sessions/${voidOrder.sessionId}/bill`);
      const voidBill = (await voidQuote.json()).data;
      expect(voidBill.paymentEligible).toBe(false);
      expect((await call(`/table-sessions/${voidOrder.sessionId}/close-all-void`, "POST", {
        expectedSessionRevision: "1", reason: "All items cancelled by customer",
      })).status).toBe(409);
      const closed = await call(`/table-sessions/${voidOrder.sessionId}/close-all-void`, "POST", {
        expectedSessionRevision: voidBill.sessionRevision, reason: "All items cancelled by customer",
      });
      expect(closed.status).toBe(200);
      expect((await closed.json()).data).toMatchObject({ closureReason: "ALL_VOID", paymentCreated: false });
      expect((await client.query("SELECT count(*)::int AS count FROM payments WHERE session_id = $1", [voidOrder.sessionId]))
        .rows[0].count).toBe(0);
      expect((await client.query("SELECT cycle_number FROM dining_tables WHERE id = $1", [tableId]))
        .rows[0].cycle_number).toBe(1);

      const order = await manual("Paid customer");
      const firstQuote = (await (await call(`/table-sessions/${order.sessionId}/bill`)).json()).data;
      expect(firstQuote.paymentEligible).toBe(false);
      expect((await pay(order.sessionId, firstQuote, "200000")).status).toBe(409);
      await client.query("UPDATE store_settings SET discount_enabled = true, discount_amount_idr = 10000, tax_enabled = true, tax_rate_bps = 1000, version = version + 1 WHERE id = 1");
      const quote = (await (await call(`/table-sessions/${order.sessionId}/bill`)).json()).data;
      expect(quote).toMatchObject({
        subtotalIdr: "150000", grandTotalIdr: "155000",
        discount: { appliedAmountIdr: "10000" }, tax: { amountIdr: "15000" },
      });
      expect(quote.settingsVersion).not.toBe(firstQuote.settingsVersion);
      const stale = await pay(order.sessionId, firstQuote, "200000");
      expect(stale.status).toBe(409);
      expect((await stale.json()).error.code).toBe("BILL_CHANGED");
      expect((await call(`/orders/${order.orderId}/confirm`, "POST", {})).status).toBe(200);
      for (const item of order.items) {
        expect((await call(`/order-items/${item.id}/served`, "PATCH", { served: true })).status).toBe(200);
      }
      const ready = (await (await call(`/table-sessions/${order.sessionId}/bill`)).json()).data;
      expect(ready.paymentEligible).toBe(true);
      const insufficient = await pay(order.sessionId, ready, "154999");
      expect(insufficient.status).toBe(422);
      expect((await insufficient.json()).error.code).toBe("CASH_INSUFFICIENT");
      const paymentKey = randomUUID();
      const results = await Promise.all([
        pay(order.sessionId, ready, "200000", paymentKey),
        pay(order.sessionId, ready, "200000", paymentKey),
      ]);
      expect(results.map((response) => response.status).sort()).toEqual([200, 201]);
      const paid = (await results[0].json()).data;
      expect((await results[1].json()).data).toEqual(paid);
      expect(paid).toMatchObject({ grandTotalIdr: "155000", changeIdr: "45000", tableStatus: "AVAILABLE" });
      expect((await pay(order.sessionId, ready, "200000")).status).toBe(409);
      expect((await client.query("SELECT count(*)::int AS count FROM payments WHERE session_id = $1", [order.sessionId]))
        .rows[0].count).toBe(1);
      expect((await client.query("SELECT cycle_number FROM dining_tables WHERE id = $1", [tableId]))
        .rows[0].cycle_number).toBe(2);
      const receiptPath = `/payments/${paid.paymentId}/receipt`;
      const receipt = (await (await call(receiptPath)).json()).data;
      expect(receipt).toMatchObject({
        grandTotalIdr: "155000", storeName: expect.any(String),
        orders: [{ customerName: "Paid customer" }],
      });
      await client.query("UPDATE menu_items SET price_idr = 1, name = 'Changed' WHERE category_id = $1", [categoryId]);
      await client.query("UPDATE store_settings SET tax_rate_bps = 0, version = version + 1 WHERE id = 1");
      expect((await (await call(receiptPath)).json()).data).toEqual(receipt);
      const replayAfterSettings = await pay(order.sessionId, ready, "200000", paymentKey);
      expect(replayAfterSettings.status).toBe(200);
      expect((await replayAfterSettings.json()).data).toEqual(paid);
      const history = (await (await call("/payments?pageSize=20")).json()).data;
      expect(history.find((row: { id: string }) => row.id === paid.paymentId).grandTotalIdr).toBe("155000");
      expect((await call(`/table-sessions/${order.sessionId}/bill`)).status).toBe(409);
      const later = await manual("Next session");
      expect(later.sessionId).not.toBe(order.sessionId);
      expect((await call(`/orders/${later.orderId}/confirm`, "POST", {})).status).toBe(200);
      for (const item of later.items) {
        expect((await call(`/order-items/${item.id}/served`, "PATCH", { served: true })).status).toBe(200);
      }
      const settingsRaceQuote = (await (await call(`/table-sessions/${later.sessionId}/bill`)).json()).data;
      const [settingsRacePayment] = await Promise.all([
        pay(later.sessionId, settingsRaceQuote, "1000"),
        client.query("UPDATE store_settings SET version = version + 1 WHERE id = 1"),
      ]);
      let raceSeed = later;
      if (settingsRacePayment.status === 201) {
        raceSeed = await manual("Order race seed");
        expect(raceSeed.sessionId).not.toBe(later.sessionId);
        expect((await call(`/orders/${raceSeed.orderId}/confirm`, "POST", {})).status).toBe(200);
        for (const item of raceSeed.items) {
          expect((await call(`/order-items/${item.id}/served`, "PATCH", { served: true })).status).toBe(200);
        }
      } else {
        expect(settingsRacePayment.status).toBe(409);
        expect((await settingsRacePayment.json()).error.code).toBe("BILL_CHANGED");
      }
      const raceQuote = (await (await call(`/table-sessions/${raceSeed.sessionId}/bill`)).json()).data;
      const [racePayment, raceOrder] = await Promise.all([
        pay(raceSeed.sessionId, raceQuote, "1000"), manual("Racing order"),
      ]);
      const newOrder = raceOrder;
      if (racePayment.status === 201) {
        expect(newOrder.sessionId).not.toBe(raceSeed.sessionId);
      } else {
        expect(racePayment.status).toBe(409);
        expect((await racePayment.json()).error.code).toBe("BILL_CHANGED");
        expect(newOrder.sessionId).toBe(raceSeed.sessionId);
      }
    } finally {
      await client.query("DELETE FROM audit_events WHERE table_id = $1", [tableId]);
      await client.query("DELETE FROM payments WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id = $1)", [tableId]);
      await client.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id = $1))", [tableId]);
      await client.query("DELETE FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id = $1)", [tableId]);
      await client.query("DELETE FROM table_sessions WHERE table_id = $1", [tableId]);
      await client.query("DELETE FROM menu_items WHERE category_id = $1", [categoryId]);
      await client.query("DELETE FROM categories WHERE id = $1", [categoryId]);
      await client.query("DELETE FROM dining_tables WHERE id = $1", [tableId]);
      if (settingsBefore) await client.query(
        "UPDATE store_settings SET discount_enabled = $1, discount_amount_idr = $2, tax_enabled = $3, tax_rate_bps = $4, version = version + 1 WHERE id = 1",
        [settingsBefore.discount_enabled, settingsBefore.discount_amount_idr,
          settingsBefore.tax_enabled, settingsBefore.tax_rate_bps],
      );
      if (profileCreated) await client.query("DELETE FROM staff_profiles WHERE user_id = $1", [user.id]);
      if (authUserCreated) await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [user.id]);
      await client.end();
      await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: "POST", headers: { Cookie: cookie, Origin: baseUrl!, "Content-Type": "application/json" },
        body: "{}",
      });
    }
  }, 90_000,
);
