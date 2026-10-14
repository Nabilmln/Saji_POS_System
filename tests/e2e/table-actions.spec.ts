import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect, signIn, call } from "./fixtures";

test("table cards show count badges and a compact accessible View table button", async ({ page, data }, testInfo) => {
  await signIn(page);
  const card = page.locator(".pos-table-card").filter({ hasText: data.tableNumber });
  await expect(card.locator(".pos-order-counts .pending")).toHaveText("0 Menunggu");
  await expect(card.locator(".pos-order-counts .active")).toHaveText("0 Aktif");
  const key = randomUUID();
  expect((await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
    clientRequestKey: key, customerName: "Table badge guest", items: [{ menuItemId: data.menuId, quantity: 1 }],
  }, key)).status()).toBe(201);
  await page.locator(".staff-content").getByRole("button", { name: "Segarkan", exact: true }).click();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(card.locator(".pos-order-counts .pending")).toHaveText(width === 320 ? "1 Pending" : "1 Menunggu");
    await expect(card.locator(".pos-order-counts .active")).toHaveText(width === 320 ? "1 Active" : "1 Aktif");
    const button = card.getByRole("button", { name: new RegExp(data.tableNumber) });
    await expect(button).toHaveText(width === 320 ? "View table" : "Lihat meja");
    await expect(card.getByRole("button")).toHaveCount(1);
    const buttonBox = await button.boundingBox(), cardBox = await card.boundingBox();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(36);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".workspace-detail .order-details")).toBeVisible();
    await expect(page).toHaveURL(/\/pos$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`table-card-badges-${width}.png`), fullPage: true });
  }
});

test("table quick actions add orders, preview receipts and pay without navigating", async ({ page, data }, testInfo) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: new RegExp(data.tableNumber) }).click();
  const pane = page.locator(".workspace-detail");
  await expect(pane.getByRole("button", { name: "Lihat struk", exact: true })).toBeDisabled();
  await expect(pane.getByRole("button", { name: "Pembayaran", exact: true })).toBeDisabled();
  await expect(pane.getByRole("link", { name: "Buka meja" })).toHaveCount(0);
  await pane.getByRole("button", { name: "Tambah order", exact: true }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByLabel("Nama pelanggan / label").fill("Quick guest");
  await page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true }).click();
  await page.getByRole("button", { name: "Simpan order Menunggu" }).click();
  await expect(page.getByRole("button", { name: "Simpan order Menunggu" })).toHaveCount(0);
  await page.getByRole("button", { name: /Semua meja/, exact: false }).click();
  await expect(pane.locator(".table-session-summary, .session-tally")).toHaveCount(0);
  await expect(pane.locator(".pos-item .order-item-price")).toContainText(/Rp\s*25\.000/);
  await pane.getByRole("button", { name: "Lihat struk", exact: true }).click();
  await expect(pane.locator(".pos-receipt")).toContainText("Belum lunas");
  await expect(page).toHaveURL(/\/pos$/);
  await pane.getByRole("button", { name: "Tutup", exact: true }).click();
  const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
  await call(page.request, `/staff/orders/${table.orders[0].id}/confirm`, "POST", {});
  await call(page.request, `/staff/order-items/${table.orders[0].items[0].id}/served`, "PATCH", { served: true });
  await pane.getByRole("button", { name: "Pembayaran", exact: true }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByLabel("Uang diterima (Rp)").fill("50000");
  await page.getByRole("checkbox", { name: /Saya sudah memeriksa/ }).check();
  await page.getByRole("button", { name: "Konfirmasi pembayaran", exact: true }).click();
  await page.route("**/api/staff/table-sessions/*/payments", async (route) => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "Bayar tunai", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ulangi transaksi yang sama" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Ulangi transaksi yang sama" }).click();
  await expect(page.getByRole("heading", { name: "Pembayaran berhasil" })).toBeVisible();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByRole("button", { name: "Lihat struk digital", exact: true }).click();
  await expect(pane.locator(".pos-receipt")).toContainText("Lunas");
  expect((await data.pool.query("SELECT count(*)::int AS n FROM payments WHERE session_id=$1", [table.session.id])).rows[0].n).toBe(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("quick-actions-paid-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(pane.locator(".pos-receipt")).toContainText("Paid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("quick-actions-paid-mobile.png"), fullPage: true });
});

test("bill follows the order list and table actions stay at the bottom while details scroll", async ({ page, data }, testInfo) => {
  await signIn(page);
  for (let index = 0; index < 10; index++) {
    const key = randomUUID();
    expect((await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
      clientRequestKey: key, customerName: `Guest ${index + 1}`, items: [{ menuItemId: data.menuId, quantity: 1 }],
    }, key)).status()).toBe(201);
  }
  for (const route of ["/pos", `/pos/tables/${data.tableId}`]) {
    await page.goto(route);
    if (route === "/pos") await page.getByRole("button", { name: new RegExp(data.tableNumber) }).click();
    const pane = page.locator(".workspace-detail");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("button", { name: width === 390 ? "English" : "Bahasa Indonesia", exact: true }).click();
      await expect(pane.locator(".pos-item")).toHaveCount(10);
      const content = pane.locator(".detail-pane-content"), footer = pane.locator(".detail-pane-footer");
      expect(await content.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe("none");
      expect(await content.evaluate((element) => element instanceof HTMLElement && element.clientWidth === element.offsetWidth)).toBe(true);
      await expect(footer.getByRole("button", { name: /^(Lihat struk|View receipt)$/ })).toBeVisible();
      await expect(pane.getByRole("heading", { name: /^(Rincian tagihan|Bill details)$/ })).toHaveCount(1);
      await expect(page.locator(".staff-content .pos-bill-lines")).toHaveCount(0);
      expect(await content.evaluate((element) => element.querySelector(".order-details")!.compareDocumentPosition(element.querySelector(".pos-bill-lines")!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
      await pane.scrollIntoViewIfNeeded();
      await content.evaluate((element) => { element.scrollTop = 0; });
      const before = await footer.boundingBox();
      await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const after = await footer.boundingBox();
      expect(Math.abs(before!.y - after!.y)).toBeLessThan(1);
      expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await content.focus();
      await expect(content).toBeFocused();
      const previousScroll = await content.evaluate((element) => element.scrollTop);
      await page.keyboard.press("PageUp");
      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeLessThan(previousScroll);
      await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      expect(after!.y + after!.height).toBeLessThanOrEqual(844);
      await expect(pane.locator(".pos-bill-total")).toContainText(width === 390 ? /250,000/ : /250\.000/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`bill-footer-${route === "/pos" ? "overview" : "table"}-${width}.png`), fullPage: true });
    }
  }
});
