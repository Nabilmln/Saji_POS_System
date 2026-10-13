import { randomUUID } from "node:crypto";
import { test, expect, signIn, call } from "./fixtures";

test("delete hides unserved items without asking for a reason and keeps the audit", async ({ page, data }) => {
  await signIn(page);
  const key = randomUUID();
  const order = (await (await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
    clientRequestKey: key, customerName: "Guest", items: [{ menuItemId: data.menuId, quantity: 1 }, { menuItemId: data.secondMenuId, quantity: 1 }],
  }, key)).json()).data;
  await page.goto(`/pos/tables/${data.tableId}`);
  const row = page.locator(".pos-item").filter({ hasText: "Teh Demo" });
  await row.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Alasan tidak diperlukan");
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator(".order-details")).not.toContainText("Teh Demo");
  expect((await (await call(page.request, `/staff/table-sessions/${order.sessionId}/bill`)).json()).data.subtotalIdr).toBe("25000");
  expect((await data.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE table_id=$1 AND action='ORDER_ITEM_VOIDED'", [data.tableId])).rows[0].n).toBe(1);
  expect((await data.pool.query("SELECT count(*)::int AS n FROM order_items WHERE order_id=$1 AND voided_at IS NOT NULL", [order.orderId])).rows[0].n).toBe(1);
});

test("serving during deletion forces a reason before a customer return can proceed", async ({ page, data }) => {
  await signIn(page);
  const key = randomUUID();
  const order = (await (await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
    clientRequestKey: key, customerName: "Guest", items: [{ menuItemId: data.menuId, quantity: 1 }],
  }, key)).json()).data;
  await call(page.request, `/staff/orders/${order.orderId}/confirm`, "POST", {});
  await page.goto(`/pos/tables/${data.tableId}`);
  await page.locator(".pos-item").getByRole("button", { name: "Hapus", exact: true }).click();
  await call(page.request, `/staff/order-items/${order.items[0].id}/served`, "PATCH", { served: true });
  await page.getByRole("dialog").getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByLabel("Penjelasan")).toBeVisible();
  expect((await data.pool.query("SELECT voided_at FROM order_items WHERE id=$1", [order.items[0].id])).rows[0].voided_at).toBeNull();
  await page.getByLabel("Penjelasan").fill("Customer returned the dish");
  await page.getByRole("dialog").getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.locator(".pos-item")).toHaveCount(0);
  await expect(page.locator(".order-details")).toContainText("Belum ada pesanan");
  expect((await data.pool.query("SELECT void_reason_type,void_reason_detail FROM order_items WHERE id=$1", [order.items[0].id])).rows[0]).toEqual({ void_reason_type: "CUSTOMER_REQUEST", void_reason_detail: "Customer returned the dish" });
});
