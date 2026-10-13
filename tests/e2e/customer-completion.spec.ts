import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, guestOrder, call } from "./fixtures";

test("confirmed cash payment thanks every guest, clears drafts, and requires a fresh QR entry", async ({ browser, page, data }, testInfo) => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const alice = await first.newPage(), bob = await second.newPage();
    await guestOrder(alice, data.token, "Aulia", data.menuName);
    const oldGuest = await alice.evaluate((token) => JSON.parse(sessionStorage.getItem(`customer:${token}:guest`)! ), data.token);
    const aliceOrder = await alice.evaluate((token) => JSON.parse(sessionStorage.getItem(`customer:${token}:orders`)!)[0], data.token);
    await guestOrder(bob, data.token, "Budi", data.menuName);
    await bob.getByRole("button", { name: "Tambah pesanan", exact: true }).click();
    await bob.getByRole("button", { name: "Tambahkan Teh Demo ke keranjang", exact: true }).click();
    await bob.getByRole("button", { name: /Lihat Keranjang/ }).click();
    await expect(bob.locator(".cart-row")).toHaveCount(1);
    await bob.getByRole("button", { name: "English", exact: true }).click();

    await signIn(page); await page.goto(`/pos/tables/${data.tableId}`);
    for (let index = 0; index < 2; index++) {
      await page.getByRole("button", { name: "Konfirmasi", exact: true }).first().click();
      await expect(page.getByRole("button", { name: /^Tersaji:/ })).toHaveCount(2);
      await page.getByRole("button", { name: /^Tersaji:/ }).nth(index).click();
      await expect(page.getByRole("button", { name: /^Tersaji:/ }).nth(index)).toHaveAttribute("aria-pressed", "true");
    }
    const before = (await (await alice.request.get(`/api/public/orders/${aliceOrder.id}`, { headers: { Authorization: `Bearer ${aliceOrder.token}` } })).json()).data;
    expect(before.status).toBe("SERVED"); expect(before.session.status).toBe("OPEN");
    await expect(alice.locator(".customer-completion:visible")).toHaveCount(0);
    await page.getByRole("link", { name: "Lihat tagihan & pembayaran" }).click();
    await page.getByLabel("Uang diterima (Rp)").fill("50000");
    await page.getByRole("checkbox", { name: /Saya sudah memeriksa/ }).check();
    await page.getByRole("button", { name: "Konfirmasi pembayaran", exact: true }).click();
    await page.getByRole("button", { name: "Bayar tunai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pembayaran berhasil" })).toBeVisible();

    await alice.bringToFront();
    await expect(alice.getByRole("heading", { name: "Terima kasih, Aulia!", exact: true })).toBeVisible({ timeout: 12000 });
    await expect(alice.locator(".customer-completion:visible")).toContainText("Sampai jumpa lagi");
    await expect(alice.locator(".customer-completion:visible")).not.toContainText("Budi");
    await expect(alice.getByRole("button", { name: "Tambah pesanan" })).toHaveCount(0);
    await expect(alice.getByRole("button", { name: "Konfirmasi Pesanan" })).toHaveCount(0);
    const paid = (await (await alice.request.get(`/api/public/orders/${aliceOrder.id}`, { headers: { Authorization: `Bearer ${aliceOrder.token}` } })).json()).data;
    expect(paid.session).toMatchObject({ status: "PAID", closedAt: expect.any(String) });
    expect(paid).not.toHaveProperty("paymentId"); expect(paid).not.toHaveProperty("cashReceivedIdr");
    const staleKey = randomUUID();
    const stale = await alice.request.post(`/api/public/tables/${data.token}/orders`, {
      headers: { Authorization: `Bearer ${oldGuest.guestToken}`, "Idempotency-Key": staleKey },
      data: { expectedCycleNumber: oldGuest.cycleNumber, clientRequestKey: staleKey, items: [{ menuItemId: data.menuId, quantity: 1 }] },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe("TABLE_CYCLE_CHANGED");
    expect(await alice.evaluate((token) => ["guest", "cart", "orders", "requestKey", "placed"].map((key) => sessionStorage.getItem(`customer:${token}:${key}`)), data.token)).toEqual([null, null, null, null, null]);
    await alice.reload();
    await expect(alice.getByRole("heading", { name: "Terima kasih, Aulia!", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page: alice }).analyze()).violations).toEqual([]);
    await alice.screenshot({ path: testInfo.outputPath("customer-paid-desktop-id.png"), fullPage: true });

    await bob.bringToFront();
    await expect(bob.getByRole("heading", { name: "Thank you, Budi!", exact: true })).toBeVisible({ timeout: 12000 });
    await expect(bob).toHaveURL(new RegExp(`/order/${data.token}/status$`));
    await expect(bob.locator(".customer-completion:visible")).toContainText("Scan the table QR again");
    await expect(bob.locator(".cart-row")).toHaveCount(0);
    expect(await bob.evaluate((token) => sessionStorage.getItem(`customer:${token}:cart`), data.token)).toBeNull();
    expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([]);
    expect(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await bob.screenshot({ path: testInfo.outputPath("customer-paid-mobile-en.png"), fullPage: true });

    await alice.goto(`/order/${data.token}`);
    await expect(alice.getByLabel("Nama pemesan")).toHaveValue("");
    await alice.getByLabel("Nama pemesan").fill("Aulia");
    await alice.getByRole("button", { name: "Lihat Menu", exact: true }).click();
    await alice.getByRole("button", { name: `Tambahkan ${data.menuName} ke keranjang`, exact: true }).click();
    await alice.getByRole("button", { name: /Lihat Keranjang/ }).click();
    await alice.getByRole("button", { name: "Konfirmasi Pesanan", exact: true }).click();
    await expect(alice.getByRole("heading", { name: "Status pesanan", exact: true })).toBeVisible();
    const nextGuest = await alice.evaluate((token) => JSON.parse(sessionStorage.getItem(`customer:${token}:guest`)! ), data.token);
    expect(nextGuest.cycleNumber).toBe(oldGuest.cycleNumber + 1);
    expect(nextGuest.guestToken).not.toBe(oldGuest.guestToken);
    const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
    expect(table.orders).toHaveLength(1); expect(table.bill.subtotalIdr).toBe("25000");
    expect((await data.pool.query("SELECT count(*)::int AS n FROM table_sessions WHERE table_id=$1", [data.tableId])).rows[0].n).toBe(2);
  } finally { await first.close(); await second.close(); }
});

test("closing an all-deleted session ends ordering without claiming payment", async ({ browser, page, data }) => {
  const context = await browser.newContext();
  try {
    const guest = await context.newPage(); await guestOrder(guest, data.token, "Guest", data.menuName);
    await signIn(page);
    const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
    await call(page.request, `/staff/order-items/${table.orders[0].items[0].id}/void`, "POST", {});
    const quote = (await (await call(page.request, `/staff/table-sessions/${table.session.id}/bill`)).json()).data;
    expect((await call(page.request, `/staff/table-sessions/${table.session.id}/close-all-void`, "POST", { expectedSessionRevision: quote.sessionRevision, reason: "Guest cancelled the entire order" })).status()).toBe(200);
    await guest.bringToFront();
    await expect(guest.getByRole("heading", { name: "Sesi pemesanan telah berakhir.", exact: true })).toBeVisible({ timeout: 12000 });
    await expect(guest.locator(".customer-completion:visible")).toContainText("tanpa pembayaran");
    await expect(guest.locator(".customer-completion .status-chip.paid")).toHaveCount(0);
    await expect(guest.getByRole("button", { name: "Tambah pesanan" })).toHaveCount(0);
    expect((await data.pool.query("SELECT count(*)::int AS n FROM payments WHERE session_id=$1", [table.session.id])).rows[0].n).toBe(0);
  } finally { await context.close(); }
});

test("a delayed checkout response cannot restore an already paid visit", async ({ browser, page, data }) => {
  const context = await browser.newContext();
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let accepted = () => {};
  const processed = new Promise<void>((resolve) => { accepted = resolve; });
  try {
    const guest = await context.newPage(); await guestOrder(guest, data.token, "Guest", data.menuName);
    await guest.getByRole("button", { name: "Tambah pesanan", exact: true }).click();
    await guest.getByRole("button", { name: "Tambahkan Teh Demo ke keranjang", exact: true }).click();
    await guest.getByRole("button", { name: /Lihat Keranjang/ }).click();
    await guest.route("**/api/public/tables/*/orders", async (route) => {
      const response = await route.fetch(); accepted(); await held; await route.fulfill({ response });
    }, { times: 1 });
    await guest.getByRole("button", { name: "Konfirmasi Pesanan", exact: true }).click();
    await processed;
    await signIn(page);
    const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
    expect(table.orders).toHaveLength(2);
    for (const order of table.orders) {
      await call(page.request, `/staff/orders/${order.id}/confirm`, "POST", {});
      await call(page.request, `/staff/order-items/${order.items[0].id}/served`, "PATCH", { served: true });
    }
    const quote = (await (await call(page.request, `/staff/table-sessions/${table.session.id}/bill`)).json()).data;
    const key = randomUUID();
    expect((await call(page.request, `/staff/table-sessions/${table.session.id}/payments`, "POST", { idempotencyKey: key, expectedSessionRevision: quote.sessionRevision, expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: "35000" }, key)).status()).toBe(201);
    await guest.bringToFront();
    await expect(guest.getByRole("heading", { name: "Terima kasih, Guest!", exact: true })).toBeVisible({ timeout: 12000 });
    const resumed = guest.waitForResponse((response) => response.url().endsWith(`/api/public/tables/${data.token}/orders`) && response.request().method() === "POST");
    release(); await (await resumed).finished();
    await guest.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(guest.getByRole("heading", { name: "Terima kasih, Guest!", exact: true })).toBeVisible();
    expect(await guest.evaluate((token) => sessionStorage.getItem(`customer:${token}:orders`), data.token)).toBeNull();
    expect(await guest.evaluate((token) => sessionStorage.getItem(`customer:${token}:guest`), data.token)).toBeNull();
  } finally { release(); await context.close(); }
});
