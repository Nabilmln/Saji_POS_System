import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("categories with live and deleted menus can be removed, reused and reassigned without losing orders", async ({ browser, page, data }, testInfo) => {
  await signIn(page, "admin");
  const context = await browser.newContext();
  let replacementId = "";
  try {
    const cashier = await context.newPage(); await signIn(cashier);
    expect((await call(cashier.request, `/admin/categories/${data.categoryId}`, "DELETE")).status()).toBe(403);
    const key = randomUUID();
    const pending = await call(cashier.request, `/staff/tables/${data.tableId}/orders`, "POST", {
      clientRequestKey: key, customerName: "Category history", items: [{ menuItemId: data.secondMenuId, quantity: 1 }],
    }, key);
    expect(pending.status()).toBe(201);
    const order = (await pending.json()).data;
    expect((await call(page.request, `/admin/menus/${data.menuId}`, "DELETE")).status()).toBe(200);
    const listed = (await (await call(page.request, "/admin/categories")).json()).data;
    expect(listed.find((category: { id: string }) => category.id === data.categoryId).menuCount).toBe(1);

    const categoryName = `Demo ${data.categoryId}`;
    await page.goto("/admin/menus");
    await page.getByRole("combobox", { name: "Kategori", exact: true }).click();
    await page.getByRole("option", { name: categoryName, exact: true }).click();
    const row = page.locator("#menu-categories tr").filter({ hasText: categoryName });
    await row.getByRole("button", { name: "Hapus", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Menu di dalamnya tetap tersimpan");
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Hapus", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Hapus", exact: true })).toBeDisabled();
    await dialog.getByRole("textbox").fill(categoryName);
    await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Kategori", exact: true })).toContainText("Semua kategori");
    const item = page.locator(".admin-menu-card").filter({ hasText: "Teh Demo" });
    await expect(item).toContainText("Kategori dihapus");
    await expect(item.locator(".status-chip")).toContainText("Pilih kategori");
    const stored = (await data.pool.query("SELECT deleted_at,is_active FROM categories WHERE id=$1", [data.categoryId])).rows[0];
    expect(stored.deleted_at).toBeTruthy(); expect(stored.is_active).toBe(false);
    expect((await data.pool.query("SELECT count(*)::int AS count FROM menu_items WHERE category_id=$1", [data.categoryId])).rows[0].count).toBe(2);
    expect((await call(page.request, `/admin/categories/${data.categoryId}`, "PATCH", { isActive: true })).status()).toBe(404);
    expect((await call(page.request, `/admin/categories/${data.categoryId}`, "DELETE")).status()).toBe(404);
    expect((await call(page.request, "/admin/menus", "POST", { categoryId: data.categoryId, name: "Blocked", description: null, imageUrl: null, priceIdr: "1", isAvailable: true })).status()).toBe(422);
    expect((await call(page.request, `/admin/menus/${data.secondMenuId}`, "PATCH", { categoryId: data.categoryId })).status()).toBe(422);

    const staffCatalogue = (await (await call(cashier.request, "/staff/menus")).json()).data.categories;
    expect(staffCatalogue.some((category: { id: string }) => category.id === data.categoryId)).toBe(false);
    const guest = await page.request.post(`/api/public/tables/${data.token}/guests`, { data: { customerName: "New guest", expectedCycleNumber: 0 } });
    const guestToken = (await guest.json()).data.guestToken;
    const publicCatalogue = await page.request.get(`/api/public/tables/${data.token}/menu`, { headers: { Authorization: `Bearer ${guestToken}` } });
    expect((await publicCatalogue.json()).data.categories.some((category: { id: string }) => category.id === data.categoryId)).toBe(false);
    const blockedKey = randomUUID();
    expect((await call(cashier.request, `/staff/tables/${data.tableId}/orders`, "POST", { clientRequestKey: blockedKey, customerName: "Blocked", items: [{ menuItemId: data.secondMenuId, quantity: 1 }] }, blockedKey)).status()).toBe(409);
    expect((await (await call(cashier.request, `/staff/table-sessions/${order.sessionId}/bill`)).json()).data.grandTotalIdr).toBe("10000");
    expect((await data.pool.query("SELECT menu_name_snapshot,quantity FROM order_items WHERE order_id=$1", [order.orderId])).rows).toEqual([{ menu_name_snapshot: "Teh Demo", quantity: 1 }]);
    expect((await data.pool.query("SELECT action FROM audit_events WHERE entity_id=$1 AND action='CATEGORY_DELETED'", [data.categoryId])).rowCount).toBe(1);

    const replacement = await call(page.request, "/admin/categories", "POST", { name: categoryName, sortOrder: 0, isActive: true });
    expect(replacement.status()).toBe(201); replacementId = (await replacement.json()).data.id;
    expect(replacementId).not.toBe(data.categoryId);
    await page.reload();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await item.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("The previous category was deleted. Choose an active category to show this item to customers again.", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Category *", exact: true }).click();
    await page.getByRole("option", { name: categoryName, exact: true }).click();
    await page.getByRole("button", { name: "Save menu item", exact: true }).click();
    await expect(page.locator(".inline-alert[role=status]")).toContainText("Menu item saved.");
    expect((await data.pool.query("SELECT category_id FROM menu_items WHERE id=$1", [data.secondMenuId])).rows[0].category_id).toBe(replacementId);
    const restored = (await (await call(cashier.request, "/staff/menus")).json()).data.categories;
    expect(restored.find((category: { id: string }) => category.id === replacementId).items.some((menu: { id: string }) => menu.id === data.secondMenuId)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("category-reassigned-en.png"), fullPage: true });
  } finally {
    await data.pool.query("UPDATE menu_items SET category_id=$1 WHERE id=$2", [data.categoryId, data.secondMenuId]);
    if (replacementId) await data.pool.query("DELETE FROM categories WHERE id=$1", [replacementId]);
    await data.pool.query("DELETE FROM audit_events WHERE entity_id=$1", [data.categoryId]);
    await context.close();
  }
});

test("normal database seeding does not inject demo categories, menus, tables or staff", async ({ data }) => {
  const counts = () => data.pool.query("SELECT (SELECT count(*) FROM categories) AS categories, (SELECT count(*) FROM menu_items) AS menus, (SELECT count(*) FROM dining_tables) AS tables, (SELECT count(*) FROM staff_profiles) AS staff");
  const before = (await counts()).rows[0];
  const { stdout } = await promisify(execFile)(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/db/seed.ts"], {
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/saji_e2e", DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/saji_e2e" },
  });
  expect(stdout).toContain("no demo records added");
  expect((await counts()).rows[0]).toEqual(before);
});
