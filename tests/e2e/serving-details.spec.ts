import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("cashiers confirm and serve directly in overview and payment details", async ({ page, data }, testInfo) => {
  await signIn(page);
  const key = randomUUID();
  const first = (await (await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", {
    clientRequestKey: key, customerName: "Guest", items: [{ menuItemId: data.menuId, quantity: 1 }],
  }, key)).json()).data;
  await page.reload();
  await page.getByRole("button", { name: new RegExp(data.tableNumber) }).click();
  const pane = page.locator(".workspace-detail");
  await page.route("**/api/staff/orders/*/confirm", (route) => route.abort("failed"), { times: 1 });
  await pane.getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await expect(page.locator(".staff-content .inline-alert[role=alert]")).toContainText("Perubahan gagal");
  await expect(pane.getByRole("checkbox", { name: /Sudah disajikan/ })).toHaveCount(0);
  await pane.getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await pane.getByRole("checkbox", { name: /Sudah disajikan/ }).click();
  await expect(pane.getByRole("checkbox", { name: /Sudah disajikan/ })).toBeChecked();
  await expect(pane.getByRole("checkbox", { name: /Sudah disajikan/ })).toBeDisabled();
  expect((await (await call(page.request, `/staff/table-sessions/${first.sessionId}/bill`)).json()).data.paymentEligible).toBe(true);
  await expect(page).toHaveURL(/\/pos$/);
  const nextKey = randomUUID();
  await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", { clientRequestKey: nextKey, customerName: "Guest", items: [{ menuItemId: data.secondMenuId, quantity: 1 }] }, nextKey);
  await pane.getByRole("button", { name: "Pembayaran", exact: true }).click();
  await expect(page.getByRole("button", { name: "Konfirmasi pembayaran", exact: true })).toBeDisabled();
  await pane.getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await pane.getByRole("checkbox", { name: /Teh Demo/ }).click();
  await expect(pane.getByRole("checkbox", { name: /Teh Demo/ })).toBeChecked();
  await page.getByLabel("Uang diterima (Rp)").fill("50000");
  await page.getByRole("checkbox", { name: /Saya sudah memeriksa/ }).check();
  await expect(page.getByRole("button", { name: "Konfirmasi pembayaran", exact: true })).toBeEnabled();
  expect((await (await call(page.request, `/staff/table-sessions/${first.sessionId}/bill`)).json()).data.subtotalIdr).toBe("35000");
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("serving-payment-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(pane.getByRole("checkbox", { name: /Served/ })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("serving-payment-mobile-en.png"), fullPage: true });
  await expect(page).toHaveURL(/\/pos$/);
});
