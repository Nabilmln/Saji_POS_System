import type { Page } from "@playwright/test";
import { test, expect, signIn, guestOrder, call } from "./fixtures";

type MotionRecord = { kind: "page" | "revenue" | "activity" | "detail" | "table" | "card"; duration: number; cancelled: boolean; path: string };
declare global {
  interface Window { __sajiMotionRecords: MotionRecord[]; __pauseSajiMotion: boolean }
}

async function observeMotion(page: Page) {
  await page.addInitScript(() => {
    window.__sajiMotionRecords = [];
    window.__pauseSajiMotion = false;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = original.call(this, keyframes, options);
      const kind = this.matches("main.staff-content,main.customer-main") ? "page" : this.matches(".detail-pane") ? "detail" : this.matches(".data-table tbody") ? "table" : this.matches(".table-card,.menu-card") ? "card" : this.closest(".revenue-chart") ? "revenue" : this.closest(".sales-activity-chart") ? "activity" : null;
      if (kind) {
        const record: MotionRecord = { kind, duration: Number(typeof options === "number" ? options : options?.duration ?? 0), cancelled: false, path: location.pathname };
        window.__sajiMotionRecords.push(record);
        const cancel = animation.cancel.bind(animation);
        animation.cancel = () => { record.cancelled = true; cancel(); };
        if (window.__pauseSajiMotion) animation.pause();
      }
      return animation;
    };
  });
  let reportLoads = 0;
  await page.route("**/api/admin/reports/revenue?*", (route) => {
    const date = new URL(route.request().url()).searchParams.get("from")!;
    const revenueIdr = String(++reportLoads * 25000);
    return route.fulfill({ json: { data: { summary: { revenueIdr, paidTransactionCount: 1 }, points: [{ date, revenueIdr, transactionCount: 1 }] } } });
  });
  await page.route("**/api/admin/reports/top-menus?*", (route) => route.fulfill({ json: { data: [] } }));
}

async function motionCounts(page: Page) {
  return page.evaluate(() => ({
    page: window.__sajiMotionRecords.filter((record) => record.kind === "page").length,
    revenue: window.__sajiMotionRecords.filter((record) => record.kind === "revenue").length,
    activity: window.__sajiMotionRecords.filter((record) => record.kind === "activity").length,
  }));
}

test("page and chart entrances follow navigation and loaded report data, without replaying on ordinary interactions", async ({ page }) => {
  await observeMotion(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page, "admin");
  await expect(page.locator(".report-summary:visible")).toBeVisible();
  await expect.poll(async () => (await motionCounts(page)).revenue).toBe(1);
  await expect.poll(async () => (await motionCounts(page)).activity).toBe(1);
  const initial = await motionCounts(page);
  expect(initial.page).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__sajiMotionRecords.every((record) => record.duration === (record.kind === "page" ? 240 : ["revenue", "activity"].includes(record.kind) ? 450 : 180)))).toBe(true);
  await page.locator(".revenue-chart:visible .revenue-plot circle").first().hover();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Sales trend", exact: true })).toBeVisible();
  expect(await motionCounts(page)).toEqual(initial);
  await page.getByRole("button", { name: "Show report", exact: true }).click();
  await expect.poll(() => motionCounts(page)).toEqual({ page: initial.page, revenue: initial.revenue + 1, activity: initial.activity + 1 });
  await page.locator(".staff-sidebar").getByRole("link", { name: "Menu & categories", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/menus$/);
  await expect.poll(() => page.evaluate(() => window.__sajiMotionRecords.filter((record) => record.kind === "page" && record.path === "/admin/menus").length)).toBeGreaterThan(0);
  const beforeReturn = await motionCounts(page);
  await page.locator(".staff-sidebar").getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".report-summary:visible")).toBeVisible();
  await expect.poll(async () => (await motionCounts(page)).revenue).toBeGreaterThan(beforeReturn.revenue);
  await expect.poll(async () => (await motionCounts(page)).activity).toBeGreaterThan(beforeReturn.activity);
});

test("reduced motion skips entrances and cancels active page and chart animations when enabled", async ({ page }) => {
  await observeMotion(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "admin");
  await expect(page.locator(".report-summary:visible")).toBeVisible();
  await expect(page.locator(".revenue-chart:visible")).toBeVisible();
  expect(await motionCounts(page)).toEqual({ page: 0, revenue: 0, activity: 0 });
  await page.evaluate(() => { window.__pauseSajiMotion = true; });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator(".staff-sidebar").getByRole("link", { name: "Menu & Kategori", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/menus$/);
  await expect.poll(async () => (await motionCounts(page)).page).toBeGreaterThan(0);
  await page.locator(".staff-sidebar").getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".report-summary:visible")).toBeVisible();
  for (const kind of ["page", "revenue", "activity"] as const) {
    await expect.poll(() => page.evaluate((value) => window.__sajiMotionRecords.filter((record) => record.kind === value && record.path === "/admin/reports" && !record.cancelled).length, kind)).toBeGreaterThan(0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.__sajiMotionRecords.every((record) => record.cancelled))).toBe(true);
  await expect(page.locator(".revenue-chart:visible")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tampilkan laporan", exact: true })).toBeEnabled();
});

test("customer menu, cart and status route entrances preserve ordering and produce no promise or client-boundary errors", async ({ page, data }) => {
  await observeMotion(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /async Client Component|uncached promise|hydration|outside.*Suspense/i.test(message.text())) errors.push(message.text()); });
  await guestOrder(page, data.token, "Motion guest", data.menuName);
  await expect(page.locator(".customer-main:visible").getByRole("heading", { name: "Status pesanan", exact: true })).toBeVisible();
  for (const path of [`/order/${data.token}`, `/order/${data.token}/cart`, `/order/${data.token}/status`]) {
    await expect.poll(() => page.evaluate((value) => window.__sajiMotionRecords.filter((record) => record.kind === "page" && record.path === value).length, path)).toBeGreaterThan(0);
  }
  const beforeUpdate = (await motionCounts(page)).page;
  const cashier = await page.context().newPage();
  await signIn(cashier);
  const order = (await data.pool.query("SELECT o.id FROM orders o JOIN table_sessions s ON s.id=o.session_id WHERE s.table_id=$1", [data.tableId])).rows[0];
  expect((await call(cashier.request, `/staff/orders/${order.id}/confirm`, "POST", {})).status()).toBe(200);
  await page.bringToFront();
  await expect(page.locator(".status-card").getByText("Sedang disiapkan", { exact: true })).toBeVisible();
  await expect.poll(async () => (await motionCounts(page)).page).toBeGreaterThan(beforeUpdate);
  const afterUpdate = (await motionCounts(page)).page;
  await page.waitForResponse((response) => response.url().endsWith(`/api/public/orders/${order.id}`) && response.ok());
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await motionCounts(page)).page).toBe(afterUpdate);
  await cashier.close();
  expect(errors).toEqual([]);
});

test("sidebar reveal interpolates and reverses without moving icons or replacing the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await observeMotion(page);
  await signIn(page, "admin");
  const shell = page.locator(".staff-shell:visible");
  const sidebar = shell.locator(".staff-sidebar");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
  const original = await shell.locator(".staff-content").elementHandle();
  const iconY = await sidebar.locator(".staff-nav-item svg").first().evaluate((icon) => icon.getBoundingClientRect().y);
  await sidebar.hover();
  const intermediate = await shell.evaluate((element) => {
    const animation = element.getAnimations().find((animation) => animation instanceof CSSTransition && animation.transitionProperty === "grid-template-columns");
    if (!animation) return null;
    animation.pause(); animation.currentTime = 100;
    return element.querySelector(".staff-sidebar")!.getBoundingClientRect().width;
  });
  expect(intermediate).not.toBeNull();
  expect(intermediate!).toBeGreaterThan(72);
  expect(intermediate!).toBeLessThan(196);
  expect(await sidebar.locator(".staff-nav-item svg").first().evaluate((icon) => icon.getBoundingClientRect().y)).toBe(iconY);
  await shell.locator(".workspace-toolbar").hover();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sidebar.hover();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(196);
  expect(await shell.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.00001);
});

test("record updates animate while identical polling and editing stay steady, including inline cashier workspaces", async ({ page, data }) => {
  await observeMotion(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await guestOrder(page, data.token, "Motion details", data.menuName);
  await signIn(page);
  const card = page.getByRole("article", { name: `Meja ${data.tableNumber}`, exact: true });
  await card.getByRole("button", { name: `Lihat meja ${data.tableNumber}`, exact: true }).click();
  const detail = page.locator(".workspace-detail .detail-pane");
  await expect(detail.getByRole("button", { name: "Konfirmasi", exact: true })).toBeVisible();
  const original = await detail.elementHandle();
  const records = () => page.evaluate(() => window.__sajiMotionRecords.filter((record) => ["detail", "card", "table"].includes(record.kind)).length);
  const beforePoll = await records();
  await page.waitForResponse((response) => response.url().endsWith(`/api/staff/tables/${data.tableId}`) && response.ok());
  // Wait for the next rendered frame after this poll's response has been committed.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await records()).toBe(beforePoll);
  await detail.getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await expect(detail.getByRole("button", { name: `Tersaji: ${data.menuName} x1`, exact: true })).toBeEnabled();
  await expect.poll(records).toBeGreaterThan(beforePoll);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  const pageBefore = (await motionCounts(page)).page;
  await detail.getByRole("button", { name: "Tambah order", exact: true }).click();
  const field = page.getByLabel("Nama pelanggan / label", { exact: true });
  await expect(field).toBeVisible();
  await expect(page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true })).toBeVisible();
  await expect.poll(async () => (await motionCounts(page)).page).toBeGreaterThan(pageBefore);
  const afterOpen = await records();
  const fieldHandle = await field.elementHandle();
  await field.fill("Still editing");
  await page.locator(".staff-sidebar:visible").hover();
  await expect(field).toHaveValue("Still editing");
  expect(await fieldHandle!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await records()).toBe(afterOpen);
  await expect(page).toHaveURL(/\/pos$/);
});
