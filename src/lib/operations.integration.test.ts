import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { restaurantDate } from "./time";

const dbUrl = process.env.TEST_DATABASE_URL;
const baseUrl = process.env.TEST_API_BASE_URL;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

it.skipIf(!dbUrl || !baseUrl || !email || !password)(
  "checks reservation lifecycle, empty closure, staff guards, and Paid-only reports", async () => {
    if (!["localhost", "127.0.0.1", "::1"].includes(new URL(dbUrl!).hostname) ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(baseUrl!).hostname)) {
      throw new Error("Operations test must use a local app and database");
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
    const busyTableId = randomUUID();
    const categoryId = randomUUID();
    const menuId = randomUUID();
    const cashierId = randomUUID();
    const menuName = `BE10 meal ${menuId.slice(0, 8)}`;
    let authUserCreated = false;
    let profileCreated = false;
    let adminRoleChanged = false;
    let otherAdminStates: { user_id: string; is_active: boolean }[] = [];
    const call = (path: string, method = "GET", body?: object, key?: string) =>
      fetch(`${baseUrl}/api${path}`, {
        method, headers: { Cookie: cookie, Origin: baseUrl!, "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const reserve = () => call("/staff/reservations", "POST", {
      tableId, customerName: "Nabila", customerContact: "08123456789",
      guestCount: 4, reservedFor: "2026-10-12T12:00:00+07:00", notes: "Phone booking",
    });
    try {
      const inserted = await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [user.id]);
      authUserCreated = inserted.rowCount === 1;
      const profile = await client.query(
        "INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'BE10 admin', 'ADMIN') ON CONFLICT DO NOTHING RETURNING user_id",
        [user.id],
      );
      profileCreated = profile.rowCount === 1;
      await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1)', [cashierId]);
      await client.query("INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'BE10 cashier', 'CASHIER')", [cashierId]);
      await client.query("INSERT INTO dining_tables (id, table_number, qr_token) VALUES ($1, $2, $3), ($4, $5, $6)",
        [tableId, `BE10-${tableId.slice(0, 8)}`, randomBytes(32).toString("base64url"),
          busyTableId, `BE10-${busyTableId.slice(0, 8)}`, randomBytes(32).toString("base64url")]);
      await client.query("INSERT INTO table_sessions (table_id) VALUES ($1)", [busyTableId]);
      await client.query("UPDATE dining_tables SET status = 'OCCUPIED' WHERE id = $1", [busyTableId]);
      await client.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `BE10-${categoryId}`]);
      await client.query("INSERT INTO menu_items (id, category_id, name, price_idr) VALUES ($1, $2, $3, 25000)",
        [menuId, categoryId, menuName]);

      const busy = await call("/staff/reservations", "POST", {
        tableId: busyTableId, customerName: "Busy table", customerContact: "081234",
        guestCount: 2, reservedFor: "2026-10-12T12:00:00+07:00",
      });
      expect(busy.status).toBe(409);
      expect((await client.query("SELECT status FROM dining_tables WHERE id = $1", [busyTableId]))
        .rows[0].status).toBe("OCCUPIED");
      const [first, duplicate] = await Promise.all([reserve(), reserve()]);
      expect([first.status, duplicate.status].sort()).toEqual([201, 409]);
      const reservation = (await (first.status === 201 ? first : duplicate).json()).data;
      const list = await call("/staff/reservations?status=RESERVED");
      expect((await list.json()).data.find((row: { id: string }) => row.id === reservation.id))
        .toMatchObject({ customerContact: "08123456789", tableId });
      const cancelled = await call(`/staff/reservations/${reservation.id}/cancel`, "POST", {
        reason: "Customer changed date",
      });
      expect(cancelled.status).toBe(200);
      expect((await cancelled.json()).data.tableStatus).toBe("AVAILABLE");
      expect((await call(`/staff/reservations/${reservation.id}/check-in`, "POST", {})).status).toBe(409);
      const checkedReservation = (await (await reserve()).json()).data;
      const checked = await call(`/staff/reservations/${checkedReservation.id}/check-in`, "POST", {});
      expect(checked.status).toBe(200);
      const { sessionId } = (await checked.json()).data;
      expect((await call(`/staff/reservations/${checkedReservation.id}/cancel`, "POST", {
        reason: "Too late to cancel",
      })).status).toBe(409);
      expect((await call(`/staff/table-sessions/${sessionId}/close-all-void`, "POST", {
        expectedSessionRevision: "1", reason: "No order was ever placed",
      })).status).toBe(409);
      expect((await call(`/staff/table-sessions/${sessionId}/close-empty`, "POST", {
        expectedSessionRevision: "2", reason: "Guest left before ordering",
      })).status).toBe(409);
      const empty = await call(`/staff/table-sessions/${sessionId}/close-empty`, "POST", {
        expectedSessionRevision: "1", reason: "Guest left before ordering",
      });
      expect(empty.status).toBe(200);
      expect((await empty.json()).data).toMatchObject({ closureReason: "EMPTY", paymentCreated: false });
      const closed = await client.query("SELECT closure_reason FROM table_sessions WHERE id = $1", [sessionId]);
      expect(closed.rows[0].closure_reason).toBe("EMPTY");
      expect((await client.query("SELECT cycle_number FROM dining_tables WHERE id = $1", [tableId]))
        .rows[0].cycle_number).toBe(1);

      const staffList = await call("/admin/staff");
      expect(staffList.status).toBe(200);
      expect((await call("/auth/admin/list-users")).status).toBe(404);
      expect((await call("/auth/admin/create-user", "POST", {})).status).toBe(404);
      expect((await call("/auth/%61dmin/list-users")).status).toBe(404);
      expect((await call("/auth/admin%2Flist-users")).status).toBe(404);
      expect((await staffList.json()).data.find((row: { userId: string }) => row.userId === cashierId))
        .toMatchObject({ role: "CASHIER", isActive: true });
      expect((await call("/admin/staff", "POST", {
        email: "invalid@example.test", displayName: "Invalid", role: "ADMIN",
      })).status).toBe(422);
      otherAdminStates = (await client.query<{ user_id: string; is_active: boolean }>(
        "SELECT user_id, is_active FROM staff_profiles WHERE role = 'ADMIN' AND user_id <> $1", [user.id],
      )).rows;
      await client.query("UPDATE staff_profiles SET is_active = false WHERE role = 'ADMIN' AND user_id <> $1", [user.id]);
      expect((await call(`/admin/staff/${user.id}`, "PATCH", { isActive: false })).status).toBe(409);
      for (const row of otherAdminStates) {
        await client.query("UPDATE staff_profiles SET is_active = $1 WHERE user_id = $2", [row.is_active, row.user_id]);
      }
      otherAdminStates = [];
      const disabled = await call(`/admin/staff/${cashierId}`, "PATCH", {
        displayName: "Evening cashier", isActive: false,
      });
      expect(disabled.status).toBe(200);
      expect((await disabled.json()).data).toMatchObject({ isActive: false, displayName: "Evening cashier" });

      const today = restaurantDate(new Date());
      const revenuePath = `/admin/reports/revenue?from=${today}&to=${today}&groupBy=day`;
      const topPath = `/admin/reports/top-menus?from=${today}&to=${today}`;
      const before = (await (await call(revenuePath)).json()).data;
      const key = randomUUID();
      const orderResponse = await call(`/staff/tables/${tableId}/orders`, "POST", {
        clientRequestKey: key, customerName: "Paid guest",
        items: [{ menuItemId: menuId, quantity: 2 }],
      }, key);
      expect(orderResponse.status).toBe(201);
      const order = (await orderResponse.json()).data;
      expect((await call(`/staff/orders/${order.orderId}/confirm`, "POST", {})).status).toBe(200);
      expect((await call(`/staff/order-items/${order.items[0].id}/served`, "PATCH", { served: true })).status).toBe(200);
      const unpaidKey = randomUUID();
      expect((await call(`/staff/tables/${busyTableId}/orders`, "POST", {
        clientRequestKey: unpaidKey, customerName: "Unpaid guest",
        items: [{ menuItemId: menuId, quantity: 3 }],
      }, unpaidKey)).status).toBe(201);
      const quote = (await (await call(`/staff/table-sessions/${order.sessionId}/bill`)).json()).data;
      const paymentKey = randomUUID();
      const payment = await call(`/staff/table-sessions/${order.sessionId}/payments`, "POST", {
        idempotencyKey: paymentKey, expectedSessionRevision: quote.sessionRevision,
        expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: quote.grandTotalIdr,
      }, paymentKey);
      expect(payment.status).toBe(201);
      const after = (await (await call(revenuePath)).json()).data;
      expect(BigInt(after.summary.revenueIdr) - BigInt(before.summary.revenueIdr))
        .toBe(BigInt(quote.grandTotalIdr));
      expect(after.summary.paidTransactionCount - before.summary.paidTransactionCount).toBe(1);
      const top = (await (await call(topPath)).json()).data;
      expect(top.find((row: { menuName: string }) => row.menuName === menuName))
        .toMatchObject({ quantitySold: 2, grossSalesIdr: "50000" });

      await client.query("UPDATE staff_profiles SET role = 'CASHIER' WHERE user_id = $1", [user.id]);
      adminRoleChanged = true;
      expect((await call(revenuePath)).status).toBe(403);
      expect((await call("/admin/settings/billing", "PUT", {})).status).toBe(403);
      expect((await call("/admin/staff")).status).toBe(403);
    } finally {
      if (adminRoleChanged) await client.query("UPDATE staff_profiles SET role = 'ADMIN' WHERE user_id = $1", [user.id]);
      for (const row of otherAdminStates) {
        await client.query("UPDATE staff_profiles SET is_active = $1 WHERE user_id = $2", [row.is_active, row.user_id]);
      }
      await client.query("DELETE FROM audit_events WHERE table_id IN ($1, $2) OR entity_id IN ($3, $4)",
        [tableId, busyTableId, cashierId, user.id]);
      await client.query("DELETE FROM payments WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id IN ($1, $2))", [tableId, busyTableId]);
      await client.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id IN ($1, $2)))", [tableId, busyTableId]);
      await client.query("DELETE FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE table_id IN ($1, $2))", [tableId, busyTableId]);
      await client.query("DELETE FROM reservations WHERE table_id IN ($1, $2)", [tableId, busyTableId]);
      await client.query("DELETE FROM table_sessions WHERE table_id IN ($1, $2)", [tableId, busyTableId]);
      await client.query("DELETE FROM menu_items WHERE category_id = $1", [categoryId]);
      await client.query("DELETE FROM categories WHERE id = $1", [categoryId]);
      await client.query("DELETE FROM dining_tables WHERE id IN ($1, $2)", [tableId, busyTableId]);
      await client.query("DELETE FROM staff_profiles WHERE user_id = $1", [cashierId]);
      await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [cashierId]);
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
