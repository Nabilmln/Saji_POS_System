import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

test("owner sidebar gains space without replacing the selected QR and remembers its preference", async ({ page, data }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "admin");
  await page.goto("/admin/tables");
  const shell = page.locator(".staff-shell:visible");
  const sidebar = shell.locator(".staff-sidebar");
  const toolbar = shell.locator(".workspace-toolbar");
  const card = page.getByRole("article", { name: `Meja ${data.tableNumber}`, exact: true });
  await card.getByRole("button", { name: "Lihat QR", exact: true }).click();
  const qr = shell.getByRole("img", { name: `Kode QR untuk pemesanan Meja ${data.tableNumber}`, exact: true });
  await expect(qr).toBeVisible();
  const originalQr = await qr.elementHandle();
  const expandedWidth = (await shell.locator(".staff-content").boundingBox())!.width;
  expect((await sidebar.boundingBox())!.width).toBe(196);
  await expect(sidebar.locator(".language-switch")).toHaveCount(0);
  await expect(toolbar.getByRole("group", { name: "Language / Bahasa", exact: true })).toHaveCount(1);
  const collapse = toolbar.getByRole("button", { name: "Ciutkan navigasi", exact: true });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(await collapse.getAttribute("aria-controls")).toBe(await sidebar.locator("nav").getAttribute("id"));
  await collapse.click();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  expect((await sidebar.boundingBox())!.width).toBe(72);
  expect((await shell.locator(".staff-content").boundingBox())!.width - expandedWidth).toBe(124);
  expect(await originalQr!.evaluate((image) => image.isConnected)).toBe(true);
  await expect(card.getByRole("button", { name: "Lihat QR", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sidebar.getByRole("link", { name: "Meja & QR", exact: true })).toHaveAttribute("aria-current", "page");
  await toolbar.getByRole("button", { name: "English", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Expand navigation", exact: true })).toHaveAttribute("aria-expanded", "false");
  await sidebar.getByRole("link", { name: "Discount & tax", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(page.locator(".staff-shell:visible")).toHaveClass(/sidebar-collapsed/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand navigation", exact: true })).toBeVisible();
  await expect(page.locator(".staff-shell:visible")).toHaveClass(/sidebar-collapsed/);
  expect(await page.evaluate(() => localStorage.getItem("saji:sidebar-collapsed"))).toBe("true");
  await page.screenshot({ path: testInfo.outputPath("owner-sidebar-collapsed.png"), fullPage: true });
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await expect(page.locator(".staff-shell:visible")).not.toHaveClass(/sidebar-collapsed/);
  expect(await page.evaluate(() => localStorage.getItem("saji:sidebar-collapsed"))).toBe("false");
  for (const width of [899, 768, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator(".workspace-toolbar:visible").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("cashier can collapse navigation without losing the manual order draft", async ({ page, data }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page);
  await page.goto(`/pos/tables/${data.tableId}`);
  await page.getByRole("button", { name: "Tambah order manual", exact: true }).click();
  const name = page.getByLabel("Nama pelanggan / label", { exact: true });
  await name.fill("Draft tetap tersimpan");
  await page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true }).click();
  const originalField = await name.elementHandle();
  await page.getByRole("button", { name: "Ciutkan navigasi", exact: true }).click();
  await expect(page.locator(".staff-shell:visible")).toHaveClass(/sidebar-collapsed/);
  await expect(name).toHaveValue("Draft tetap tersimpan");
  expect(await originalField!.evaluate((field) => field.isConnected)).toBe(true);
  await expect(page.locator(".summary-card").filter({ hasText: "Ringkasan order" })).toContainText(`1× ${data.menuName}`);
  await page.getByRole("button", { name: "Perluas navigasi", exact: true }).click();
  await expect(name).toHaveValue("Draft tetap tersimpan");
  await expect(page.locator(".staff-sidebar").getByRole("link", { name: "Meja & Pesanan", exact: true })).toHaveAttribute("aria-current", "page");
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
    const box = (await language.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
