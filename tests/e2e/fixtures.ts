import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";

type Data = { pool: Pool; tableId: string; tableNumber: string; token: string; categoryId: string; menuId: string; secondMenuId: string; menuName: string; staffIds: string[] };
export const test = base.extend<{ data: Data }>({
  data: async ({}, runTest) => {
    const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/saji_e2e";
    const url = new URL(connectionString);
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.pathname !== "/saji_e2e") throw new Error("Fixtures require dedicated local saji_e2e database");
    const pool = new Pool({ connectionString });
    const tableId = randomUUID(), categoryId = randomUUID(), menuId = randomUUID(), secondMenuId = randomUUID();
    const token = randomBytes(32).toString("base64url"), tableNumber = `E2E-${tableId.slice(0, 6)}`, menuName = `Nasi Demo ${menuId.slice(0, 6)}`;
    const settings = (await pool.query("SELECT * FROM store_settings WHERE id=1")).rows[0];
    await pool.query("UPDATE store_settings SET discount_enabled=false, tax_enabled=false, discount_amount_idr=0, version=version+1 WHERE id=1");
    await pool.query("INSERT INTO dining_tables(id,table_number,qr_token) VALUES($1,$2,$3)", [tableId, tableNumber, token]);
    await pool.query("INSERT INTO categories(id,name) VALUES($1,$2)", [categoryId, `Demo ${categoryId}`]);
    await pool.query("INSERT INTO menu_items(id,category_id,name,price_idr) VALUES($1,$2,$3,25000),($4,$2,'Teh Demo',10000)", [menuId, categoryId, menuName, secondMenuId]);
    const staffIds: string[] = [];
    try { await runTest({ pool, tableId, tableNumber, token, categoryId, menuId, secondMenuId, menuName, staffIds }); }
    finally {
      await pool.query("DELETE FROM audit_events WHERE table_id=$1 OR entity_id=ANY($2::uuid[])", [tableId, [...staffIds, "00000000-0000-4000-8000-000000000001"]]);
      await pool.query("DELETE FROM payments WHERE session_id IN(SELECT id FROM table_sessions WHERE table_id=$1)", [tableId]);
      await pool.query("DELETE FROM order_items WHERE order_id IN(SELECT id FROM orders WHERE session_id IN(SELECT id FROM table_sessions WHERE table_id=$1))", [tableId]);
      await pool.query("DELETE FROM orders WHERE session_id IN(SELECT id FROM table_sessions WHERE table_id=$1)", [tableId]);
      await pool.query("DELETE FROM reservations WHERE table_id=$1", [tableId]);
      await pool.query("DELETE FROM table_sessions WHERE table_id=$1", [tableId]);
      await pool.query("DELETE FROM menu_items WHERE category_id=$1", [categoryId]);
      await pool.query("DELETE FROM categories WHERE id=$1", [categoryId]);
      await pool.query("DELETE FROM dining_tables WHERE id=$1", [tableId]);
      for (const id of staffIds) { await pool.query("DELETE FROM staff_profiles WHERE user_id=$1", [id]); await pool.query('DELETE FROM neon_auth."user" WHERE id=$1', [id]); }
      await pool.query("UPDATE staff_profiles SET is_active=true WHERE user_id='00000000-0000-4000-8000-000000000002'");
      await pool.query("UPDATE store_settings SET store_name=$1,discount_enabled=$2,discount_amount_idr=$3,tax_enabled=$4,tax_rate_bps=$5,version=version+1 WHERE id=1", [settings.store_name, settings.discount_enabled, settings.discount_amount_idr, settings.tax_enabled, settings.tax_rate_bps]);
      await pool.end();
    }
  },
});
export { expect };

export async function signIn(page: Page, role: "admin" | "cashier" = "cashier") {
  await page.goto(role === "admin" ? "/owner-login" : "/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel("Kata sandi", { exact: true }).fill("e2e-only-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(role === "admin" ? /\/admin\/reports$/ : /\/pos$/);
}

export async function call(request: APIRequestContext, path: string, method = "GET", body?: object, key?: string) {
  const result = await request.fetch(`/api${path}`, { method, data: body, headers: { Origin: "http://localhost:3100", ...(key ? { "Idempotency-Key": key } : {}) } });
  return result;
}

export async function guestOrder(page: Page, token: string, name: string, menuName: string) {
  await page.goto(`/order/${token}`);
  await page.getByLabel("Nama pemesan").fill(name);
  await page.getByRole("button", { name: "Lihat Menu", exact: true }).click();
  await page.getByRole("button", { name: `Tambahkan ${menuName} ke keranjang`, exact: true }).click();
  await page.getByRole("button", { name: /Lihat Keranjang/ }).click();
  await page.getByRole("button", { name: "Konfirmasi Pesanan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Status pesanan", exact: true })).toBeVisible();
}
