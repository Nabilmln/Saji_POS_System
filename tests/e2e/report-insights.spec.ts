import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

test("sales insights use the loaded period and fit both languages and themes", async ({ page }, testInfo) => {
  let mode: "populated" | "empty" | "zero" | "error" = "empty";
  await page.route("**/api/admin/reports/revenue?*", async (route) => {
    if (mode === "error") return route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } });
    const points = mode === "populated" ? [
      { date: "2026-10-10", revenueIdr: "100000", transactionCount: 2 },
      { date: "2026-10-12", revenueIdr: "300000", transactionCount: 3 },
    ] : mode === "zero" ? [{ date: "2026-10-11", revenueIdr: "0", transactionCount: 1 }] : [];
    await route.fulfill({ json: { data: { summary: { revenueIdr: mode === "populated" ? "400000" : "0", paidTransactionCount: mode === "populated" ? 5 : mode === "zero" ? 1 : 0 }, points } } });
  });
  await page.route("**/api/admin/reports/top-menus?*", (route) => route.fulfill({ json: { data: [] } }));
  await signIn(page, "admin");
  const panel = page.locator(".report-insights");
  await expect(panel).toBeVisible();
  await page.getByRole("radio", { name: "Kustom", exact: true }).check();
  await page.getByRole("combobox", { name: "Dari tanggal", exact: true }).fill("2026-10-10");
  await page.getByRole("combobox", { name: "Sampai tanggal", exact: true }).fill("2026-10-13");
  mode = "populated";
  await page.getByRole("button", { name: "Tampilkan laporan", exact: true }).click();
  await expect(panel.locator(".insight-period-meta")).toContainText("4 hari");
  await expect(panel.locator(".insight-dates")).toContainText("10 Okt 2026");
  await expect(panel.locator(".insight-dates")).toContainText("13 Okt 2026");
  await expect(panel.locator(".insight-amount")).toHaveText(/Rp\s*300\.000/);
  await expect(panel.locator(".insight-peak-date")).toContainText("12 Okt 2026");
  await expect(panel.locator(".insight-peak-date")).toContainText("3 transaksi");
  await expect(panel.locator(".insight-share strong")).toHaveText("75%");
  await expect(panel.locator(".insight-daily-average dd")).toHaveText(/Rp\s*100\.000/);
  await expect(panel.locator(".insight-activity dd")).toHaveText([/Rp\s*100\.000/, "2 / 4", "2"]);
  expect(await panel.locator(".insight-activity").evaluate((element) => {
    const style = getComputedStyle(element);
    return parseFloat(style.paddingInlineStart) >= 12 && parseFloat(style.borderTopWidth) === 1;
  })).toBe(true);

  // Draft dates and failed loads must not relabel the last successful report.
  await page.getByRole("combobox", { name: "Dari tanggal", exact: true }).fill("2026-10-11");
  await expect(panel.locator("time").first()).toHaveAttribute("datetime", "2026-10-10");
  mode = "error";
  await page.getByRole("button", { name: "Tampilkan laporan", exact: true }).click();
  await expect(page.locator(".inline-alert")).toContainText("Laporan belum dapat dimuat");
  await expect(panel.locator("time").first()).toHaveAttribute("datetime", "2026-10-10");
  await page.getByRole("combobox", { name: "Dari tanggal", exact: true }).fill("2026-10-10");
  mode = "populated";
  await page.getByRole("button", { name: "Tampilkan laporan", exact: true }).click();
  await expect(page.locator(".inline-alert")).toHaveCount(0);

  for (const [width, locale, theme] of [[1440, "id", "light"], [1024, "id", "dark"], [390, "en", "light"], [320, "en", "dark"]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    if (locale === "en") await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(panel).toHaveAccessibleName(locale === "en" ? "Period details" : "Rincian periode");
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dateWrap = await panel.locator(".insight-period").boundingBox();
    expect(dateWrap!.height).toBeLessThan(110);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`insights-${width}-${locale}-${theme}.png`), fullPage: true });
  }

  mode = "empty";
  await page.getByRole("button", { name: "Show report", exact: true }).click();
  await expect(panel.locator(".insight-empty")).toContainText("No completed payments");
  await expect(panel.locator(".insight-activity dd")).toHaveText([/IDR\s*0/, "0 / 4", "4"]);
  await expect(panel.locator(".insight-share")).toHaveCount(0);
  mode = "zero";
  await page.getByRole("button", { name: "Show report", exact: true }).click();
  await expect(panel.locator(".insight-amount")).toHaveText(/IDR\s*0/);
  await expect(panel.locator(".insight-activity dd")).toHaveText([/IDR\s*0/, "1 / 4", "3"]);
  await expect(panel.locator(".insight-share")).toHaveCount(0);
});
