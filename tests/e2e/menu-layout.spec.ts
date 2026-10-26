import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

test("menu cards share icon controls and five-column layouts with an unboxed search toolbar", async ({ page, data }, testInfo) => {
  await data.pool.query("UPDATE categories SET name='Pilihan dapur dan minuman segar' WHERE id=$1", [data.categoryId]);
  await data.pool.query("UPDATE menu_items SET name='Nasi Goreng' WHERE id=$1", [data.menuId]);
  await data.pool.query("INSERT INTO menu_items(category_id,name,price_idr) SELECT $1,'Hidangan '||n,18000 FROM generate_series(1,8) n", [data.categoryId]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "admin");
  await page.goto("/admin/menus");
  const cards = page.locator(".admin-menu-grid .menu-card");
  await expect(cards).toHaveCount(10);
  const toolbar = page.getByRole("search");
  await expect(toolbar.getByRole("heading")).toHaveCount(0);
  expect(await toolbar.evaluate((element) => element.closest(".admin-panel"))).toBeNull();
  for (const [width, language, theme, columns] of [
    [1440, "id", "light", 5], [1280, "en", "dark", 5], [1024, "en", "light", 3],
    [640, "id", "dark", 3], [390, "en", "light", 2], [320, "id", "dark", 1],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.getByRole("button", { name: language === "id" ? "Bahasa Indonesia" : "English", exact: true }).click();
    expect(await page.locator(".admin-menu-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length)).toBe(columns);
    const controls = await toolbar.locator(":scope > *").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, bottom: box.bottom };
    }));
    if (width >= 1024) {
      expect(Math.max(...controls.map((box) => box.bottom)) - Math.min(...controls.map((box) => box.bottom))).toBeLessThanOrEqual(2);
      expect(controls[0].width).toBeGreaterThan(controls[1].width);
      expect(controls[0].width).toBeGreaterThan(controls[2].width);
      expect(controls[0].x + controls[0].width).toBeLessThanOrEqual(controls[1].x);
    }
    const styles = await toolbar.evaluate((element) => ({ border: getComputedStyle(element).borderWidth, background: getComputedStyle(element).backgroundColor }));
    expect(styles).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)" });
    const buttons = await cards.locator(".table-action").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect(), card = element.closest(".menu-card")!.getBoundingClientRect();
      return { label: element.getAttribute("aria-label"), title: element.getAttribute("title"), text: element.textContent, svg: element.querySelectorAll("svg").length, width: box.width, fits: box.left >= card.left && box.right <= card.right };
    }));
    expect(buttons).toHaveLength(20);
    for (const button of buttons) {
      expect(button.label).toBeTruthy(); expect(button.title).toBe(button.label);
      expect(button.text).toBe(""); expect(button.svg).toBe(1); expect(button.width).toBe(36); expect(button.fits).toBe(true);
    }
    expect(await cards.locator(".table-actions").evaluateAll((groups) => groups.every((group) => {
      const tops = [...group.children].map((button) => button.getBoundingClientRect().top);
      return Math.max(...tops) - Math.min(...tops) <= 1;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`menu-layout-${width}-${language}-${theme}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".staff-sidebar").hover();
  await expect(page.locator(".staff-shell:visible")).not.toHaveClass(/sidebar-collapsed/);
  expect(await page.locator(".admin-menu-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length)).toBe(5);
  await toolbar.hover();
  await page.getByLabel("Cari menu", { exact: true }).fill("Nasi Goreng");
  await expect(cards).toHaveCount(1);
  const dish = cards.filter({ has: page.getByRole("heading", { name: "Nasi Goreng", exact: true }) });
  await dish.getByRole("button", { name: "Edit", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Harga (Rp) *", { exact: true }).fill("27000");
  await page.getByRole("button", { name: "Simpan Menu", exact: true }).click();
  await expect(dish).toContainText(/Rp\s*27\.000/);
  const toggle = dish.getByRole("switch");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("group", { name: "Ketersediaan", exact: true }).getByText("Tersedia", { exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole("group", { name: "Ketersediaan", exact: true }).getByText("Tidak tersedia", { exact: true }).click();
  await expect(dish).toBeVisible();
  await dish.getByRole("switch").click();
  await expect(cards).toHaveCount(0);
  await page.getByRole("group", { name: "Ketersediaan", exact: true }).getByText("Semua", { exact: true }).click();
  await expect(dish).toBeVisible();
  await expect(dish.getByRole("switch")).toBeChecked();
  await dish.getByRole("button", { name: "Hapus", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await dialog.getByRole("textbox").fill("Nasi Goreng");
  await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cards).toHaveCount(0);
});
