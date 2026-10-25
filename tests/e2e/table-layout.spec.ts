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
  const reservation = await call(page.request, "/staff/reservations", "POST", {
    tableId: data.tableId, customerName: "Layout Reservation", customerContact: "08123456789", guestCount: 2,
    reservedFor: "2026-10-25T12:30:00+07:00", notes: "Near the window",
  });
  expect(reservation.status()).toBe(201);
  const reservationId = (await reservation.json()).data.id;
  expect((await call(page.request, `/staff/reservations/${reservationId}/check-in`, "POST", {})).status()).toBe(200);
  const pending = await order();

  let role = "cashier";
  for (const target of [
    { path: "/pos", role: "cashier", name: "inbox", timestamp: true },
    { path: "/pos/transactions", role: "cashier", name: "transactions", timestamp: true },
    { path: "/pos/reservations", role: "cashier", name: "reservations", timestamp: true },
    { path: "/admin/menus", role: "admin", name: "categories", timestamp: false },
    { path: "/admin/staff", role: "admin", name: "staff", timestamp: false },
    { path: "/admin/reports", role: "admin", name: "daily-sales", timestamp: false },
  ] as const) {
    if (role !== target.role) { await signIn(page, target.role); role = target.role; }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(target.path);
    if (target.name === "reservations") await page.getByRole("group", { name: "Status reservasi", exact: true }).getByText("Sudah check-in", { exact: true }).click();
    if (target.name === "daily-sales") await expect(page.getByRole("heading", { name: "Angka harian", exact: true })).toBeVisible();
    const table = page.locator(".data-table:visible");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(table.locator("caption")).toHaveCount(0);
    await expect(table).toHaveAccessibleName(/.+/);
    for (const width of [1280, 390, 320]) {
      if (width === 390) await page.getByRole("button", { name: "English", exact: true }).click();
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: width === 1280 ? "light" : "dark" });
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
      if (target.name !== "daily-sales") {
        const controls = table.locator("tbody td:last-child button, tbody td:last-child a");
        expect(await controls.count()).toBeGreaterThan(0);
        const actions = await controls.evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect(), cell = element.closest("td")!.getBoundingClientRect();
          return { shared: element.classList.contains("table-action"), label: element.getAttribute("aria-label"), title: element.getAttribute("title"), text: element.textContent?.trim(), icon: element.querySelectorAll("svg[aria-hidden=true]").length, width: box.width, height: box.height, fits: box.left >= cell.left && box.right <= cell.right && box.top >= cell.top && box.bottom <= cell.bottom };
        }));
        for (const action of actions) {
          expect(action.shared).toBe(true);
          expect(action.label).toBeTruthy();
          expect(action.title).toBe(action.label);
          expect(action.text).toBe("");
          expect(action.icon).toBe(1);
          expect(action.width).toBeCloseTo(36, 1);
          expect(action.height).toBeCloseTo(36, 1);
          expect(action.fits).toBe(true);
        }
        const wrappedGroups = await table.locator(".table-actions").evaluateAll((groups) => groups.filter((group) => {
          const tops = [...group.children].map((control) => control.getBoundingClientRect().top);
          return tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 1;
        }).length);
        expect(wrappedGroups, target.name).toBe(0);
      }
      if (target.timestamp) {
        await expect(page.getByRole("columnheader", { name: width === 1280 ? "Waktu" : "Time", exact: true })).toBeVisible();
        const stamp = table.locator(".table-date-time").first();
        await expect(stamp).toHaveAttribute("datetime", /T/);
        await expect(stamp.locator("small")).toHaveText(/\d{2}[:.]\d{2} WIB/);
        const dateBox = await stamp.locator("span").boundingBox(), timeBox = await stamp.locator("small").boundingBox();
        expect(timeBox!.y).toBeGreaterThanOrEqual(dateBox!.y + dateBox!.height);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations, target.name).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${target.name}-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
    if (target.name === "inbox") {
      const row = table.getByRole("row").filter({ hasText: pending.orderId.slice(0, 8) });
      await row.getByRole("button", { name: "Detail", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".workspace-detail:visible .order-details")).toBeVisible();
      await row.getByRole("button", { name: "Konfirmasi", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(row).toHaveCount(0);
      expect((await data.pool.query("SELECT status FROM orders WHERE id=$1", [pending.orderId])).rows[0].status).toBe("PREPARING");
    }
    if (target.name === "reservations") {
      const link = table.getByRole("link", { name: "Lihat meja", exact: true });
      await expect(link).toHaveAttribute("href", `/pos/tables/${data.tableId}`);
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/pos/tables/${data.tableId}$`));
    }
  }
});
