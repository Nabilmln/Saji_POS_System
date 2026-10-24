import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

test("sales dashboard keeps a compact truthful grid and an always-visible daily table", async ({ page }, testInfo) => {
  const amounts = [350000, 520000, 0, 680000, 450000, 910000, 720000];
  const counts = [4, 6, 0, 7, 5, 9, 8];
  await page.route("**/api/admin/reports/revenue?*", (route) => {
    const from = new URL(route.request().url()).searchParams.get("from")!;
    const points = amounts.map((amount, index) => ({ date: new Date(Date.parse(from) + index * 86400000).toISOString().slice(0, 10), revenueIdr: String(amount), transactionCount: counts[index] }));
    return route.fulfill({ json: { data: { summary: { revenueIdr: "3630000", paidTransactionCount: 39 }, points } } });
  });
  await page.route("**/api/admin/reports/top-menus?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("limit")).toBe("5");
    return route.fulfill({ json: { data: [
      { menuName: "Nasi Goreng Saji", quantitySold: 32, grossSalesIdr: "800000" },
      { menuName: "Ayam Bakar Sambal Matah", quantitySold: 24, grossSalesIdr: "840000" },
      { menuName: "Es Teh", quantitySold: 22, grossSalesIdr: "110000" },
      { menuName: "Mie Goreng dengan Sayuran dan Telur", quantitySold: 18, grossSalesIdr: "450000" },
      { menuName: "Kopi Susu", quantitySold: 15, grossSalesIdr: "270000" },
    ] } });
  });
  await signIn(page, "admin");
  await expect(page.locator(".bento-stat")).toHaveCount(4);
  await expect(page.locator(".bento-revenue .metric-value")).toHaveText(/Rp\s*3\.630\.000/);
  await expect(page.locator(".bento-count .metric-value")).toHaveText("39");
  await expect(page.locator(".bento-average .metric-value")).toHaveText(/Rp\s*93\.076/);
  await expect(page.locator(".bento-daily-average .metric-value")).toHaveText(/Rp\s*518\.571/);
  await expect(page.locator(".activity-legend dd")).toHaveText(["6", "1"]);
  await expect(page.locator(".top-menu-row")).toHaveCount(5);
  await expect(page.locator(".report-data details,.report-data summary")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Pendapatan harian (WIB)", exact: true })).toBeVisible();
  await expect(page.locator(".report-data tbody tr")).toHaveCount(7);
  await expect(page.locator(".report-data tbody tr").nth(2)).toContainText(/Rp\s*0/);
  for (const [width, language, theme] of [[1440, "id", "light"], [1024, "id", "dark"], [390, "en", "light"], [320, "en", "dark"]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    if (language === "en") await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.getByRole("heading", { name: language === "en" ? "Daily figures" : "Angka harian", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boxes = await page.locator(".bento-stat").evaluateAll((cards) => cards.map((card) => ({ y: card.getBoundingClientRect().y, fits: card.scrollWidth <= card.clientWidth + 1 })));
    expect(boxes.every((box) => box.fits)).toBe(true);
    if (width === 1440) {
      expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
      const trend = await page.locator(".bento-chart").boundingBox();
      const activity = await page.locator(".bento-activity").boundingBox();
      expect(trend!.y).toBe(activity!.y);
      expect(trend!.width).toBeGreaterThan(activity!.width);
      const menus = await page.locator(".bento-menus").boundingBox();
      const daily = await page.locator(".bento-daily").boundingBox();
      expect(menus!.y).toBe(daily!.y);
    }
    const tableBox = await page.locator(".report-data").boundingBox();
    const paginationBox = await page.locator(".bento-daily>.pagination-panel").boundingBox();
    expect(paginationBox!.y - tableBox!.y - tableBox!.height).toBeGreaterThanOrEqual(15);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}-${language}-${theme}.png`), fullPage: true });
  }
});
