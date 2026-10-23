import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("language persists across customer pages and generated dish photos stay focused on white", async ({ page, data }, testInfo) => {
  await data.pool.query("UPDATE menu_items SET name='Nasi Goreng', image_url=null WHERE id=$1", [data.menuId]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/order/${data.token}`);
  await expect(page.getByLabel("Nama pemesan *", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Your name *", { exact: true }).fill("Maya");
  await page.getByRole("button", { name: "View menu", exact: true }).click();
  const dish = page.locator(".menu-card").filter({ hasText: "Nasi Goreng" });
  await expect(dish.getByRole("img", { name: "Nasi Goreng", exact: true })).toHaveAttribute("src", /\/images\/menu\/nasi-goreng\.webp$/);
  await expect(dish.locator(".photo-caption")).toHaveCount(0);
  await expect(dish).toContainText(/IDR\s*25,000/);
  expect(await dish.locator(".photo-frame").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect(dish.getByRole("img")).toHaveJSProperty("naturalWidth", 640);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`customer-yellow-en-${colorScheme}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Add Nasi Goreng to cart", exact: true }).click();
  await page.getByRole("button", { name: /View cart/ }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Confirm order", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Order status", exact: true })).toBeVisible();
  await expect(page.locator(".status-chip")).toContainText("Awaiting confirmation");
  await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Status pesanan", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
});

test("English owner sections and cashier order-to-receipt workflow preserve permissions and amounts", async ({ browser, page, data }, testInfo) => {
  await signIn(page, "admin");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sales report", exact: true })).toBeVisible();
  expect((await call(page.request, "/staff/me")).status()).toBe(403);
  await page.goto("/admin/menus");
  await expect(page.getByRole("navigation", { name: "Page sections" })).toHaveCount(0);
  await expect(page.locator("#menu-filters")).toContainText("Find a menu item");
  await expect(page.locator("#menu-categories")).toContainText("Categories");
  await page.getByRole("button", { name: "Add menu item", exact: true }).click();
  await page.getByRole("combobox", { name: "Category *", exact: true }).click();
  await page.getByRole("option", { name: `Demo ${data.categoryId}`, exact: true }).click();
  await page.getByLabel("Menu item name *", { exact: true }).fill("English preview dish");
  await page.getByLabel("Price (IDR) *", { exact: true }).fill("31000");
  await page.getByRole("button", { name: "Save menu item", exact: true }).click();
  await expect(page.locator(".inline-alert[role=status]")).toContainText("Menu item saved.");
  await expect(page.getByRole("heading", { name: "English preview dish", exact: true })).toBeVisible();
  expect((await data.pool.query("SELECT price_idr FROM menu_items WHERE name='English preview dish' AND category_id=$1", [data.categoryId])).rows[0].price_idr).toBe("31000");
  for (const path of ["/admin/tables", "/admin/settings", "/admin/staff", "/admin/reports"]) {
    await page.goto(path);
    await expect(page.locator(".loading-block")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([]);
  }
  await page.goto("/admin/menus");
  await page.screenshot({ path: testInfo.outputPath("owner-yellow-sections-en.png"), fullPage: true });
  const context = await browser.newContext();
  try {
    const cashier = await context.newPage();
    await signIn(cashier);
    await cashier.getByRole("button", { name: "English", exact: true }).click();
    await cashier.goto(`/pos/tables/${data.tableId}`);
    await cashier.getByRole("button", { name: "Add manual order", exact: true }).click();
    await cashier.getByLabel("Customer name / label", { exact: true }).fill("English guest");
    await cashier.getByRole("button", { name: `Add ${data.menuName}`, exact: true }).click();
    await cashier.getByRole("button", { name: "Save Pending order", exact: true }).click();
    await expect(cashier.locator(".inline-alert[role=status]")).toContainText("Order saved as Pending");
    await cashier.getByRole("button", { name: "Confirm", exact: true }).click();
    await cashier.getByRole("button", { name: /^Served:/ }).click();
    await expect(cashier.getByRole("button", { name: /^Served:/ })).toHaveAttribute("aria-pressed", "true");
    await cashier.getByRole("link", { name: "Payment", exact: true }).click();
    await cashier.getByLabel("Cash received (IDR)", { exact: true }).fill("100000");
    await cashier.getByRole("checkbox", { name: "I have reviewed the latest bill and the cash received", exact: true }).check();
    await cashier.getByRole("button", { name: "Confirm payment", exact: true }).click();
    await cashier.getByRole("button", { name: "Pay cash", exact: true }).click();
    await expect(cashier.getByRole("heading", { name: "Payment successful", exact: true })).toBeVisible();
    await cashier.getByRole("link", { name: "View digital receipt", exact: true }).click();
    await cashier.setViewportSize({ width: 390, height: 844 });
    await expect(cashier.locator(".pos-receipt")).toContainText(/IDR\s*25,000/);
    await expect(cashier.locator(".pos-receipt")).toContainText("Paid");
    expect((await new AxeBuilder({ page: cashier }).analyze()).violations).toEqual([]);
    expect((await call(cashier.request, "/admin/me")).status()).toBe(403);
    await cashier.screenshot({ path: testInfo.outputPath("cashier-receipt-en.png"), fullPage: true });
  } finally { await context.close(); }
});
