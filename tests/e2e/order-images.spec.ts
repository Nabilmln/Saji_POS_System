import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("order details align left photos, title quantities, prices and action buttons in both languages", async ({ page, data }, testInfo) => {
  await signIn(page);
  await data.pool.query("UPDATE menu_items SET image_url='/images/menu/nasi-goreng.webp' WHERE id=$1", [data.menuId]);
  const key = randomUUID();
  await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
    clientRequestKey: key, customerName: "Guest", items: [{ menuItemId: data.menuId, quantity: 1 }, { menuItemId: data.secondMenuId, quantity: 1, note: "No sugar, please serve with the main dish." }],
  }, key);
  const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
  expect(table.orders[0].items.find((item: { menuName: string }) => item.menuName === data.menuName).imageUrl).toBe("/images/menu/nasi-goreng.webp");
  await page.goto(`/pos/tables/${data.tableId}`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.getByRole("button", { name: "English", exact: true }).click();
    const row = page.locator(".pos-item").filter({ hasText: data.menuName });
    const image = row.getByRole("img", { name: data.menuName, exact: true });
    await expect(image).toBeVisible();
    const photo = await image.boundingBox(), copy = await row.locator(".order-item-copy").boundingBox();
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(copy!.x);
    await expect(row.locator(".order-item-copy strong")).toHaveText(`${data.menuName} x1`);
    const actions = await row.locator(".pos-item-actions").boundingBox();
    const body = await row.locator(".order-item-body").boundingBox();
    for (const itemRow of await page.locator(".pos-item").all()) {
      const frame = await itemRow.locator(".order-item-photo").boundingBox();
      const itemBody = await itemRow.locator(".order-item-body").boundingBox();
      expect(Math.abs(frame!.y - itemBody!.y)).toBeLessThan(1);
      expect(Math.abs(frame!.height - itemBody!.height)).toBeLessThan(1);
    }
    expect(actions!.x).toBe(copy!.x);
    expect(actions!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
    await expect(row.getByRole("checkbox")).toHaveCount(0);
    await expect(row.getByRole("button", { name: /^(Tersaji|Served):/ })).toBeDisabled();
    await expect(row.getByRole("button", { name: /^(Hapus|Remove)$/ })).toBeVisible();
    const served = await row.getByRole("button", { name: /^(Tersaji|Served):/ }).boundingBox();
    const remove = await row.getByRole("button", { name: /^(Hapus|Remove)$/ }).boundingBox();
    expect(remove!.y).toBe(served!.y);
    expect(remove!.x - (served!.x + served!.width)).toBeCloseTo(8, 0);
    expect(Math.abs(remove!.x + remove!.width - (copy!.x + copy!.width))).toBeLessThan(1);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(76);
    await expect(page.locator(".workspace-detail .session-tally, .workspace-detail .table-session-summary")).toHaveCount(0);
    expect(photo!.width).toBeLessThanOrEqual(48);
    expect(photo!.height).toBeLessThanOrEqual(body!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`order-photos-${width}.png`), fullPage: true });
  }
  await expect(page.locator(".pos-item").filter({ hasText: "Teh Demo" }).locator(".photo-placeholder")).toBeVisible();
  await expect(page.locator(".pos-item").filter({ hasText: "Teh Demo" }).locator(".photo-placeholder span")).toBeHidden();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const serveButton = page.locator(".order-serve-button").first();
  await serveButton.click();
  await expect(serveButton).toHaveAttribute("aria-pressed", "true");
  await expect(serveButton).toBeDisabled();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const primaryColor = await page.locator(".table-quick-actions > .primary-button").evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(serveButton).toHaveCSS("background-color", primaryColor);
    await expect(serveButton).toHaveCSS("opacity", "1");
    await expect(serveButton.locator("svg")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`served-yellow-${colorScheme}.png`), fullPage: true });
  }
});
