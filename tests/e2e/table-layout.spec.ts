import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("admin and cashier tables share compact centered cells and stacked timestamps", async ({ page, data }, testInfo) => {
  await signIn(page);
  async function order() {
    const key = randomUUID();
    const response = await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
      clientRequestKey: key, customerName: "Layout Demo", items: [{ menuItemId: data.menuId, quantity: 1 }],
    }, key);
    expect(response.status()).toBe(201);
    return (await response.json()).data;
  }
  const paid = await order();
  await call(page.request, `/staff/orders/${paid.orderId}/confirm`, "POST", {});
  await call(page.request, `/staff/order-items/${paid.items[0].id}/served`, "PATCH", { served: true });
  const quote = (await (await call(page.request, `/staff/table-sessions/${paid.sessionId}/bill`)).json()).data;
  const paymentKey = randomUUID();
  expect((await call(page.request, `/staff/table-sessions/${paid.sessionId}/payments`, "POST", {
    idempotencyKey: paymentKey, expectedSessionRevision: quote.sessionRevision,
    expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: "25000",
  }, paymentKey)).status()).toBe(201);
  await order();

  let role = "cashier";
  for (const target of [
    { path: "/pos", role: "cashier", name: "inbox", timestamp: true },
    { path: "/pos/transactions", role: "cashier", name: "transactions", timestamp: true },
    { path: "/admin/menus", role: "admin", name: "categories", timestamp: false },
    { path: "/admin/staff", role: "admin", name: "staff", timestamp: false },
    { path: "/admin/reports", role: "admin", name: "daily-sales", timestamp: false },
  ] as const) {
    if (role !== target.role) { await signIn(page, target.role); role = target.role; }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(target.path);
    if (target.name === "daily-sales") await page.getByText("Lihat angka harian", { exact: true }).click();
    const table = page.locator(".data-table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(table.locator("caption")).toHaveCount(0);
    await expect(table).toHaveAccessibleName(/.+/);
    for (const width of [1280, 390]) {
      if (width === 390) await page.getByRole("button", { name: "English", exact: true }).click();
      await page.setViewportSize({ width, height: 900 });
      const cells = await table.locator("th,td").evaluateAll((elements) => elements.map((element) => {
        const style = getComputedStyle(element);
        return { text: element.textContent, align: style.textAlign, vertical: style.verticalAlign, padding: style.paddingInlineStart, fits: element.scrollWidth <= element.clientWidth + 1 };
      }));
      for (const cell of cells) {
        expect(cell.align, target.name).toBe("center");
        expect(cell.vertical, target.name).toBe("middle");
        expect(cell.padding, target.name).toBe("6px");
        expect.soft(cell.fits, `${target.name}: ${cell.text}`).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), target.name).toBe(true);
      if (width === 1280) expect(await page.locator(".data-table-wrap").evaluate((element) => element.scrollWidth <= element.clientWidth + 1), target.name).toBe(true);
      if (target.timestamp) {
        await expect(page.getByRole("columnheader", { name: width === 1280 ? "Waktu" : "Time", exact: true })).toBeVisible();
        const stamp = table.locator(".table-date-time").first();
        await expect(stamp).toHaveAttribute("datetime", /T/);
        await expect(stamp.locator("small")).toHaveText(/\d{2}[:.]\d{2} WIB/);
        const dateBox = await stamp.locator("span").boundingBox(), timeBox = await stamp.locator("small").boundingBox();
        expect(timeBox!.y).toBeGreaterThanOrEqual(dateBox!.y + dateBox!.height);
      }
      if (target.name === "inbox" || target.name === "staff" || target.name === "daily-sales") expect((await new AxeBuilder({ page }).analyze()).violations, target.name).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${target.name}-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
  }
});
