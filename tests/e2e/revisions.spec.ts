import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { test, expect, signIn, call } from "./fixtures";

async function confirmDelete(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Tinjau penghapusan" })).toBeVisible();
  await dialog.getByRole("button", { name: "Lanjutkan" }).click();
  await expect(dialog.getByRole("button", { name: "Hapus", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox").fill("incorrect confirmation");
  await expect(dialog.getByRole("button", { name: "Hapus", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("owner sees cashier email, resets credentials, and deletes access with two confirmations", async ({ browser, page, data }, testInfo) => {
  await signIn(page, "admin");
  const email = `revision-${randomUUID()}@example.test`, password = "initial-cashier-password", newPassword = "updated-cashier-password";
  const created = await call(page.request, "/admin/staff", "POST", { email, password, displayName: "Revision Cashier", role: "CASHIER" });
  expect(created.status()).toBe(201);
  const account = (await created.json()).data;
  data.staffIds.push(account.userId);
  const context = await browser.newContext();
  try {
    const cashier = await context.newPage();
    await cashier.goto("/login");
    await cashier.getByLabel("Email", { exact: true }).fill(email);
    await cashier.getByLabel("Kata sandi", { exact: true }).fill(password);
    await cashier.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(cashier).toHaveURL(/\/pos$/);
    expect((await call(cashier.request, `/admin/staff/${account.userId}`, "DELETE")).status()).toBe(403);
    await page.goto("/admin/staff");
    const row = page.getByRole("row").filter({ hasText: "Revision Cashier" });
    await expect(row).toContainText(email);
    const ownerId = "00000000-0000-4000-8000-000000000001";
    expect((await call(page.request, `/admin/staff/${ownerId}`, "DELETE")).status()).toBe(409);
    expect((await call(page.request, `/admin/staff/${ownerId}/password`, "POST", { password: newPassword })).status()).toBe(409);
    await expect(page.getByRole("row").filter({ hasText: "Test Admin" }).getByRole("button", { name: "Hapus", exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Atur kata sandi", exact: true }).click();
    await page.getByLabel("Kata sandi baru", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Simpan kata sandi", exact: true }).click();
    await expect(page.locator(".toast[role=status]")).toContainText("Kata sandi kasir diperbarui");
    await expect(page.locator(".credential-preview input[readonly]").last()).toHaveValue(newPassword);
    expect((await call(cashier.request, "/staff/me")).status()).toBe(401);
    expect((await cashier.request.post("/api/auth/sign-in/email", { data: { email, password }, headers: { Origin: "http://localhost:3100" } })).status()).toBe(401);
    expect((await cashier.request.post("/api/auth/sign-in/email", { data: { email, password: newPassword }, headers: { Origin: "http://localhost:3100" } })).status()).toBe(200);
    expect((await call(cashier.request, "/staff/me")).status()).toBe(200);
    await page.reload();
    await expect(page.locator(".credential-preview")).toHaveCount(0);
    await row.getByRole("button", { name: "Hapus", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Hapus", exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("delete-cashier-review.png") });
    await confirmDelete(page, "Revision Cashier");
    await expect(row).toHaveCount(0);
    await expect(page.locator(".toast[role=status]")).toContainText("Akun kasir dihapus");
    expect((await call(cashier.request, "/staff/me")).status()).toBe(401);
    expect((await cashier.request.post("/api/auth/sign-in/email", { data: { email, password: newPassword }, headers: { Origin: "http://localhost:3100" } })).status()).toBe(401);
    expect((await call(page.request, `/admin/staff/${account.userId}`, "PATCH", { isActive: true })).status()).toBe(404);
    expect((await call(page.request, `/admin/staff/${account.userId}/password`, "POST", { password: newPassword })).status()).toBe(404);
    const profile = (await data.pool.query("SELECT is_active, deleted_at FROM staff_profiles WHERE user_id=$1", [account.userId])).rows[0];
    expect(profile.is_active).toBe(false); expect(profile.deleted_at).toBeTruthy();
    const audit = JSON.stringify((await data.pool.query("SELECT details FROM audit_events WHERE entity_id=$1", [account.userId])).rows);
    expect(audit).not.toContain(password); expect(audit).not.toContain(newPassword);
  } finally { await context.close(); }
});

test("deleting a menu and a settled table preserves receipts and permits a new table number", async ({ browser, page, data }) => {
  await signIn(page, "admin");
  const context = await browser.newContext();
  let replacementId = "";
  try {
    const cashier = await context.newPage(); await signIn(cashier);
    const key = randomUUID();
    const order = (await (await call(cashier.request, `/staff/tables/${data.tableId}/orders`, "POST", { clientRequestKey: key, customerName: "History preservation", items: [{ menuItemId: data.menuId, quantity: 1 }] }, key)).json()).data;
    expect((await call(page.request, `/admin/tables/${data.tableId}`, "DELETE")).status()).toBe(409);
    await call(cashier.request, `/staff/orders/${order.orderId}/confirm`, "POST", {});
    await call(cashier.request, `/staff/order-items/${order.items[0].id}/served`, "PATCH", { served: true });
    const quote = (await (await call(cashier.request, `/staff/table-sessions/${order.sessionId}/bill`)).json()).data;
    const paymentKey = randomUUID();
    const payment = (await (await call(cashier.request, `/staff/table-sessions/${order.sessionId}/payments`, "POST", { idempotencyKey: paymentKey, expectedSessionRevision: quote.sessionRevision, expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: "50000" }, paymentKey)).json()).data;
    await page.goto("/admin/menus");
    await page.getByLabel("Cari menu", { exact: true }).fill(data.menuName);
    const menu = page.locator(".menu-card").filter({ hasText: data.menuName });
    await menu.getByRole("button", { name: "Hapus", exact: true }).click();
    await confirmDelete(page, data.menuName);
    await expect(menu).toHaveCount(0);
    await page.goto("/admin/tables");
    const table = page.getByRole("row").filter({ hasText: data.tableNumber });
    await table.getByRole("button", { name: "Hapus", exact: true }).click();
    await confirmDelete(page, `Meja ${data.tableNumber}`);
    await expect(table).toHaveCount(0);
    expect((await page.request.get(`/api/public/tables/${data.token}`)).status()).toBe(404);
    expect((await call(page.request, `/admin/tables/${data.tableId}`, "PATCH", { isActive: true })).status()).toBe(404);
    const receipt = (await (await call(cashier.request, `/staff/payments/${payment.paymentId}/receipt`)).json()).data;
    expect(receipt.grandTotalIdr).toBe("25000"); expect(receipt.tableNumber).toBe(data.tableNumber);
    const replacement = await call(page.request, "/admin/tables", "POST", { tableNumber: data.tableNumber });
    expect(replacement.status()).toBe(201); const newTable = (await replacement.json()).data; replacementId = newTable.id;
    expect(newTable.orderUrl).not.toContain(data.token);
    expect((await data.pool.query("SELECT count(*)::int AS total FROM payments WHERE session_id=$1", [order.sessionId])).rows[0].total).toBe(1);
  } finally {
    if (replacementId) await data.pool.query("DELETE FROM dining_tables WHERE id=$1", [replacementId]);
    await context.close();
  }
});

test("menu page-size toggles reset paging, preserve row boundaries and stay separated from data", async ({ page, data }, testInfo) => {
  for (let index = 0; index < 26; index++) await data.pool.query("INSERT INTO menu_items(category_id,name,price_idr) VALUES($1,$2,10000)", [data.categoryId, `Revision batch ${String(index).padStart(2, "0")}`]);
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page, "admin"); await page.goto("/admin/menus");
  await page.getByLabel("Cari menu", { exact: true }).fill("Revision batch");
  await expect(page.locator(".admin-menu-grid .menu-card")).toHaveCount(20);
  expect(await page.locator(".admin-menu-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(4);
  const filters = await page.locator(".menu-filters > *").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().bottom));
  expect(Math.max(...filters) - Math.min(...filters)).toBeLessThanOrEqual(2);
  const pagination = page.locator("#menu-items .pagination-panel");
  await pagination.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.locator(".admin-menu-grid .menu-card")).toHaveCount(6);
  await expect(pagination.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  await pagination.getByRole("radio", { name: "10", exact: true }).check();
  await expect(page.locator(".admin-menu-grid .menu-card")).toHaveCount(10);
  await expect(pagination).toContainText("Halaman 1 / 3");
  await expect(page.locator(".admin-menu-grid .menu-card").first()).toContainText("Revision batch 00");
  await pagination.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.locator(".admin-menu-grid .menu-card").first()).toContainText("Revision batch 10");
  await pagination.getByRole("radio", { name: "15", exact: true }).check();
  await expect(page.locator(".admin-menu-grid .menu-card")).toHaveCount(15);
  await expect(pagination).toContainText("Halaman 1 / 2");
  await pagination.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.locator(".admin-menu-grid .menu-card")).toHaveCount(11);
  await expect(pagination.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
  await pagination.getByRole("radio", { name: "20", exact: true }).check();
  await expect(page.locator(".admin-menu-grid .menu-card")).toHaveCount(20);
  const listBox = await page.locator(".admin-menu-grid").boundingBox();
  const pagerBox = await pagination.boundingBox();
  expect(pagerBox!.y - (listBox!.y + listBox!.height)).toBeGreaterThanOrEqual(16);
  const categoryTable = await page.locator("#menu-categories .data-table-wrap").boundingBox();
  const categoryPager = await page.locator("#menu-categories .pagination-panel").boundingBox();
  expect(categoryPager!.y - (categoryTable!.y + categoryTable!.height)).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 1680, height: 1050 });
  expect(await page.locator(".admin-menu-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(5);
  await page.screenshot({ path: testInfo.outputPath("menu-five-columns.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect((await call(page.request, "/admin/menus?pageSize=26")).status()).toBe(422);
  expect((await call(page.request, "/admin/staff?pageSize=26")).status()).toBe(422);
});

test("table and customer lists use the shared page-size toggle without losing page boundaries", async ({ page, data }, testInfo) => {
  const tableIds = Array.from({ length: 26 }, () => randomUUID());
  try {
    for (const [index, id] of tableIds.entries()) {
      await data.pool.query("INSERT INTO dining_tables(id,table_number,qr_token) VALUES($1,$2,$3)", [id, `Paging-${id.slice(0, 6)}-${index}`, randomUUID()]);
      await data.pool.query("INSERT INTO menu_items(category_id,name,price_idr) VALUES($1,$2,10000)", [data.categoryId, `Page menu ${String(index).padStart(2, "0")}`]);
    }
    await signIn(page, "admin"); await page.goto("/admin/tables");
    const pager = page.getByRole("navigation", { name: "Navigasi halaman" });
    await expect(page.locator(".data-table tbody tr")).toHaveCount(20);
    await pager.getByRole("radio", { name: "10", exact: true }).check();
    await expect(page.locator(".data-table tbody tr")).toHaveCount(10);
    await pager.getByRole("button", { name: "Berikutnya" }).click();
    await expect(pager).toContainText("Halaman 2");
    await pager.getByRole("radio", { name: "15", exact: true }).check();
    await expect(page.locator(".data-table tbody tr")).toHaveCount(15);
    await expect(pager).toContainText("Halaman 1");
    const tableBox = await page.locator(".data-table-wrap").boundingBox();
    const pagerBox = await pager.boundingBox();
    expect(pagerBox!.y - (tableBox!.y + tableBox!.height)).toBeGreaterThanOrEqual(16);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("radio", { name: "15", exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("table-pagination-mobile.png"), fullPage: true });

    await page.goto(`/order/${data.token}`);
    await page.getByLabel("Nama pemesan").fill("Pagination guest");
    await page.getByRole("button", { name: "Lihat Menu", exact: true }).click();
    await page.getByLabel("Cari menu", { exact: true }).fill("Page menu");
    await expect(page.locator(".menu-card")).toHaveCount(20);
    const customerPager = page.getByRole("navigation", { name: "Navigasi halaman" });
    await customerPager.getByRole("radio", { name: "10", exact: true }).check();
    await expect(page.locator(".menu-card")).toHaveCount(10);
    await customerPager.getByRole("button", { name: "Berikutnya" }).click();
    await expect(page.locator(".menu-card").first()).toContainText("Page menu 10");
    await customerPager.getByRole("radio", { name: "15", exact: true }).check();
    await expect(page.locator(".menu-card")).toHaveCount(15);
    await expect(page.locator(".menu-card").first()).toContainText("Page menu 00");
    await page.getByRole("button", { name: "English", exact: true }).click();
    const englishPager = page.getByRole("navigation", { name: "Pagination" });
    await expect(englishPager.getByRole("group", { name: "Items per page" })).toBeVisible();
    await expect(englishPager).toContainText("15 items per page");
  } finally { await data.pool.query("DELETE FROM dining_tables WHERE id=ANY($1::uuid[])", [tableIds]); }
});
