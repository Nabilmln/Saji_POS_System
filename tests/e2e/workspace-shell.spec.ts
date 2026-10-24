import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

test("owner navigation expands on hover and keyboard focus without replacing the selected QR", async ({ page, data }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "admin");
  await page.evaluate(() => localStorage.setItem("saji:sidebar-collapsed", "false"));
  await page.goto("/admin/tables");
  const shell = page.locator(".staff-shell:visible");
  const sidebar = shell.locator(".staff-sidebar");
  const toolbar = shell.locator(".workspace-toolbar");
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  expect((await sidebar.boundingBox())!.width).toBe(72);
  await expect(toolbar.locator(".navigation-toggle")).toBeHidden();
  await expect(sidebar.locator(".language-switch")).toHaveCount(0);
  await expect(toolbar.getByRole("group", { name: "Language / Bahasa", exact: true })).toHaveCount(1);
  await expect(page.locator(".brand-caption")).toHaveCount(0);
  const card = page.getByRole("article", { name: `Meja ${data.tableNumber}`, exact: true });
  await card.getByRole("button", { name: "Lihat QR", exact: true }).click();
  const qr = shell.getByRole("img", { name: `Kode QR untuk pemesanan Meja ${data.tableNumber}`, exact: true });
  await expect(qr).toBeVisible();
  const originalQr = await qr.elementHandle();
  const compactWidth = (await shell.locator(".staff-content").boundingBox())!.width;
  const compactLinkYs = await sidebar.locator(".staff-nav-item").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().y));
  await sidebar.hover();
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  expect((await sidebar.boundingBox())!.width).toBe(196);
  expect(compactWidth - (await shell.locator(".staff-content").boundingBox())!.width).toBe(124);
  const expandedLinkYs = await sidebar.locator(".staff-nav-item").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().y));
  expandedLinkYs.forEach((y, index) => expect(Math.abs(y - compactLinkYs[index])).toBeLessThanOrEqual(1));
  await expect(shell.locator(".workspace-detail .brand-wordmark")).toBeVisible();
  await expect(sidebar.locator(".staff-nav-label")).toHaveText(["Penjualan", "Restoran", "Tim"]);
  await expect(sidebar.getByRole("group", { name: "Restoran", exact: true }).getByRole("link")).toHaveCount(2);
  await expect(sidebar.getByRole("group", { name: "Tim", exact: true }).getByRole("link", { name: "Akun Staf", exact: true })).toBeVisible();
  expect(await originalQr!.evaluate((image) => image.isConnected)).toBe(true);
  await expect(card.getByRole("button", { name: "Lihat QR", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("owner-hover-expanded-id.png"), fullPage: true });
  await toolbar.hover();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await toolbar.getByRole("button", { name: "Bahasa Indonesia", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(sidebar.getByRole("link", { name: "Laporan Penjualan", exact: true })).toBeFocused();
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await page.mouse.move(700, 100);
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await page.keyboard.press("Shift+Tab");
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await toolbar.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await sidebar.hover();
  await expect(sidebar.locator(".staff-nav-label")).toHaveText(["Sales", "Restaurant", "Team"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("owner-hover-expanded-en-dark.png"), fullPage: true });
  await sidebar.getByRole("link", { name: "Discount & tax", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await page.locator(".staff-content:visible").hover();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await page.reload();
  await expect(page.locator(".staff-shell:visible")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".staff-sidebar:visible").getByRole("link", { name: "Discount & tax", exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("owner-hover-collapsed.png"), fullPage: true });
  for (const width of [899, 768, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator(".workspace-toolbar:visible").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("cashier hover navigation keeps its service groups and manual order draft", async ({ page, data }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page);
  await page.goto(`/pos/tables/${data.tableId}`);
  await page.getByRole("button", { name: "Tambah order manual", exact: true }).click();
  const name = page.getByLabel("Nama pelanggan / label", { exact: true });
  await name.fill("Draft tetap tersimpan");
  await page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true }).click();
  const originalField = await name.elementHandle();
  const shell = page.locator(".staff-shell:visible");
  const sidebar = shell.locator(".staff-sidebar");
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await sidebar.hover();
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await expect(sidebar.locator(".staff-nav-label")).toHaveText(["Pelayanan", "Riwayat"]);
  await expect(sidebar.getByRole("group", { name: "Pelayanan", exact: true }).getByRole("link")).toHaveCount(2);
  await expect(sidebar.getByRole("group", { name: "Riwayat", exact: true }).getByRole("link")).toHaveCount(1);
  await expect(name).toHaveValue("Draft tetap tersimpan");
  expect(await originalField!.evaluate((field) => field.isConnected)).toBe(true);
  await expect(page.locator(".summary-card").filter({ hasText: "Ringkasan order" })).toContainText(data.menuName);
  await name.hover();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await expect(name).toHaveValue("Draft tetap tersimpan");
  await expect(sidebar.getByRole("link", { name: "Meja & Pesanan", exact: true })).toHaveAttribute("aria-current", "page");
});

test("top-right language controls fit narrow workspaces and mobile navigation stays keyboard accessible", async ({ page, data }, testInfo) => {
  await signIn(page, "admin");
  await page.goto("/admin/tables");
  await expect(page.getByRole("article", { name: `Meja ${data.tableNumber}`, exact: true })).toBeVisible();
  for (const [width, language, colorScheme] of [[390, "English", "light"], [320, "Bahasa Indonesia", "dark"]] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const toolbar = page.locator(".workspace-toolbar:visible");
    await toolbar.getByRole("button", { name: language, exact: true }).click();
    const toggle = toolbar.locator(".navigation-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".staff-sidebar:visible")).toHaveCount(0);
    await expect(page.locator(".language-switch:visible")).toHaveCount(1);
    const positions = await toolbar.evaluate((header) => {
      const rect = header.getBoundingClientRect();
      const language = header.querySelector(".language-switch")!.getBoundingClientRect();
      return { rightGap: rect.right - language.right, centerDifference: Math.abs(rect.top + rect.height / 2 - (language.top + language.height / 2)), fits: header.scrollWidth <= header.clientWidth + 1 };
    });
    expect(positions.rightGap).toBeGreaterThanOrEqual(15);
    expect(positions.rightGap).toBeLessThanOrEqual(17);
    expect(positions.centerDifference).toBeLessThanOrEqual(1);
    expect(positions.fits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`workspace-header-${width}.png`), fullPage: true });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const navigation = page.locator(".staff-sidebar:visible");
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link", { name: language === "English" ? "Tables & QR" : "Meja & QR", exact: true })).toBeVisible();
  }
  for (const path of ["/login", `/order/${data.token}`]) {
    await page.goto(path);
    const language = page.locator(".language-switch:visible");
    await expect(language).toHaveCount(1);
    await expect(page.locator(".brand-caption")).toHaveCount(0);
    const box = (await language.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});


test("touch tablets keep an explicit navigation toggle", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, hasTouch: true });
  try {
    const page = await context.newPage();
    await signIn(page, "admin");
    const shell = page.locator(".staff-shell:visible");
    await expect(shell.locator(".navigation-toggle")).toBeVisible();
    await shell.getByRole("button", { name: "Ciutkan navigasi", exact: true }).click();
    await expect(shell).toHaveClass(/sidebar-collapsed/);
    await shell.locator(".staff-sidebar").hover();
    await expect(shell).toHaveClass(/sidebar-collapsed/);
    await shell.getByRole("button", { name: "Perluas navigasi", exact: true }).click();
    await expect(shell).not.toHaveClass(/sidebar-collapsed/);
    await expect(shell.locator(".staff-nav-label")).toHaveText(["Penjualan", "Restoran", "Tim"]);
  } finally { await context.close(); }
});
