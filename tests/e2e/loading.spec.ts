import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, signIn } from "./fixtures";

async function hold(page: Page, pattern: string) {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const pending: Promise<void>[] = [];
  await page.route(pattern, (route) => {
    const response = ready.then(() => route.continue());
    pending.push(response);
    return response;
  });
  return async () => { release(); await Promise.all(pending); await page.unroute(pattern); };
}

test("owner navigation uses shared localized skeletons without blocking the sidebar", async ({ page, data }, testInfo) => {
  await signIn(page, "admin");
  await expect(page.locator(".report-summary")).toBeVisible();
  const release = await hold(page, "**/api/admin/menus?*");
  try {
    await page.locator(".staff-sidebar").getByRole("link", { name: "Menu & Kategori", exact: true }).click();
    const loading = page.locator(".loading-skeleton").filter({ has: page.locator(".skeleton-grid") });
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("role", "status");
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading.locator(".skeleton-content")).toHaveAttribute("aria-hidden", "true");
    await expect(loading.locator("button, input, a")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Menu tidak ditemukan", exact: true })).toHaveCount(0);
    for (const [width, language, theme] of [[1440, "id", "light"], [1024, "id", "dark"], [390, "en", "light"], [320, "en", "dark"]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      if (language === "en") await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(loading.locator(".loading-label")).toHaveText(language === "en" ? "Loading menu…" : "Memuat menu…");
      expect(await loading.locator(".skeleton-content").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`menu-skeleton-${width}-${language}-${theme}.png`), fullPage: true });
    }
  } finally { await release(); }
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await expect(page.locator(".menu-card").filter({ hasText: data.menuName })).toBeVisible();
  await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, pattern, shape] of [
    ["Meja & QR", "**/api/admin/tables", ".skeleton-table"],
    ["Akun Staf", "**/api/admin/staff?*", ".skeleton-table"],
    ["Diskon & Pajak", "**/api/admin/settings/billing", ".skeleton-form"],
  ]) {
    const done = await hold(page, pattern);
    try {
      await page.locator(".staff-sidebar").getByRole("link", { name, exact: true }).click();
      await expect(page.locator(`.loading-skeleton ${shape}`)).toBeVisible();
      await expect(page.locator(".staff-sidebar").getByRole("link", { name: "Laporan Penjualan", exact: true })).toBeEnabled();
    } finally { await done(); }
    await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  }
});

test("reports retain loaded results during updates and settings failures stop loading", async ({ page }) => {
  const release = await hold(page, "**/api/admin/reports/revenue?*");
  try {
    await signIn(page, "admin");
    await expect(page.locator(".loading-skeleton .sales-bento")).toBeVisible();
    await expect(page.locator(".report-summary")).toHaveCount(0);
  } finally { await release(); }
  await expect(page.locator(".report-summary")).toBeVisible();
  const refresh = await hold(page, "**/api/admin/reports/revenue?*");
  try {
    await page.getByRole("button", { name: "Tampilkan laporan", exact: true }).click();
    await expect(page.locator(".report-insights")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".report-summary")).toBeVisible();
    await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  } finally { await refresh(); }
  await expect(page.locator(".report-insights")).toHaveAttribute("aria-busy", "false");
  await page.route("**/api/admin/settings/billing", (route) => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Connection interrupted" } } }), { times: 1 });
  await page.locator(".staff-sidebar").getByRole("link", { name: "Diskon & Pajak", exact: true }).click();
  await expect(page.locator('.inline-alert[role="alert"]')).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.locator(".admin-settings-grid")).toBeVisible();
  await expect(page.locator('.inline-alert[role="alert"]')).toHaveCount(0);
});

test("cashier first-load and detail skeletons preserve loaded tables during syncing", async ({ page, data }, testInfo) => {
  const release = await hold(page, "**/api/staff/tables");
  try {
    await signIn(page);
    await expect(page.locator(".loading-skeleton .pos-table-grid")).toBeVisible();
    await expect(page.locator(".loading-skeleton .skeleton-table")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("tables-skeleton-desktop.png"), fullPage: true });
  } finally { await release(); }
  const table = page.locator(".pos-table-card").filter({ hasText: data.tableNumber });
  await expect(table).toBeVisible();
  const refresh = await hold(page, "**/api/staff/tables");
  try {
    const requested = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/staff/tables");
    await page.locator(".pos-sync-actions").getByRole("button", { name: "Segarkan", exact: true }).click();
    await requested;
    await expect(table).toBeVisible();
    await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  } finally { await refresh(); }
  const detail = await hold(page, `**/api/staff/tables/${data.tableId}`);
  try {
    await table.getByRole("button", { name: `Lihat meja ${data.tableNumber}`, exact: true }).click();
    await expect(page.locator(".workspace-detail .loading-skeleton")).toBeVisible();
  } finally { await detail(); }
  await expect(page.locator(".workspace-detail .loading-skeleton")).toHaveCount(0);
  await page.route("**/api/staff/menus", (route) => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }), { times: 1 });
  await page.getByRole("button", { name: "Tambah order", exact: true }).click();
  await expect(page.locator('.inline-alert[role="alert"]')).toContainText("Menu belum dapat dimuat");
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  const menu = await hold(page, "**/api/staff/menus");
  try {
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(page.locator(".loading-skeleton .skeleton-grid")).toBeVisible();
  } finally { await menu(); }
  await expect(page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true })).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
});

test("customer menu skeleton resolves to dishes and reservation navigation stays interruptible", async ({ page, data }) => {
  await page.goto(`/order/${data.token}`);
  await page.getByLabel("Nama pemesan *", { exact: true }).fill("Maya");
  const menu = await hold(page, `**/api/public/tables/${data.token}/menu`);
  try {
    await page.getByRole("button", { name: "Lihat Menu", exact: true }).click();
    await expect(page.locator(".loading-skeleton .skeleton-grid")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await menu(); }
  await expect(page.getByRole("button", { name: `Tambahkan ${data.menuName} ke keranjang`, exact: true })).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await signIn(page);
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  const reservations = await hold(page, "**/api/staff/reservations?*");
  try {
    await page.locator(".staff-sidebar").getByRole("link", { name: "Reservasi", exact: true }).click();
    await expect(page.locator(".loading-skeleton .skeleton-table")).toBeVisible();
    await page.locator(".staff-sidebar").getByRole("link", { name: "Riwayat Transaksi", exact: true }).click();
    await expect(page).toHaveURL(/\/pos\/transactions$/);
    await expect(page.getByRole("heading", { name: "Riwayat pembayaran", exact: true })).toBeVisible();
    await expect(page.locator(".loading-skeleton:visible")).toHaveCount(0);
  } finally { await reservations(); }
});
