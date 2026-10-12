import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("reservation creation, cancellation, check-in and empty-session closure work", async ({ page, data }) => {
  await signIn(page); await page.goto("/pos/reservations");
  async function reserve() {
    await page.getByRole("button", { name: "Tambah reservasi" }).click();
    await page.getByLabel("Nama pelanggan", { exact: true }).fill("Nadia Reservasi");
    await page.getByLabel("Kontak pelanggan").fill("08123456789");
    await page.getByLabel("Meja tersedia").selectOption(data.tableId);
    await page.getByLabel("Waktu reservasi (WIB)").fill("2026-10-20T12:30");
    await page.getByRole("button", { name: "Simpan reservasi" }).click();
    await expect(page.locator(".reservation-row")).toContainText("Nadia Reservasi");
  }
  await reserve();
  await page.getByRole("button", { name: "Batalkan reservasi", exact: true }).click();
  await page.getByLabel("Alasan pembatalan").fill("Pelanggan membatalkan kunjungan");
  await page.getByRole("button", { name: "Konfirmasi pembatalan" }).click();
  await expect(page.getByText("Tidak ada reservasi pada status ini.")).toBeVisible();
  await reserve(); page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pos/tables/${data.tableId}$`));
  await page.getByRole("button", { name: "Tutup sesi kosong" }).click();
  await page.getByLabel("Alasan penutupan").fill("Tamu pergi sebelum memesan");
  await page.getByRole("button", { name: "Tutup sesi", exact: true }).click();
  await expect(page.getByText("Tersedia", { exact: true })).toBeVisible();
  expect((await data.pool.query("SELECT closure_reason FROM table_sessions WHERE table_id=$1", [data.tableId])).rows[0].closure_reason).toBe("EMPTY");
});

test("Admin manages cashier access and sees Paid-only revenue with accessible chart data", async ({ page, data }) => {
  await signIn(page, "admin"); await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Tambah Kasir" }).click();
  await page.getByLabel("Nama staf", { exact: true }).fill("Kasir Baru Demo");
  await page.getByLabel("Email", { exact: true }).fill(`cashier-${randomUUID()}@example.test`);
  const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/staff") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Simpan staf", exact: true }).click();
  const response = await createdResponse; expect(response.status()).toBe(201);
  const created = (await response.json()).data; data.staffIds.push(created.userId);
  await expect(page.getByRole("status")).toContainText("Email pengaturan kata sandi telah dikirim");
  const row = page.locator(".admin-list-row").filter({ hasText: "Kasir Baru Demo" });
  page.once("dialog", (dialog) => dialog.accept()); await row.getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row.getByRole("button", { name: "Aktifkan", exact: true })).toBeVisible();
  expect((await data.pool.query("SELECT is_active FROM staff_profiles WHERE user_id=$1", [created.userId])).rows[0].is_active).toBe(false);

  const key = randomUUID();
  const order = (await (await call(page.request, `/staff/tables/${data.tableId}/orders`, "POST", { clientRequestKey: key, customerName: "Paid report demo", items: [{ menuItemId: data.menuId, quantity: 2 }] }, key)).json()).data;
  await call(page.request, `/staff/orders/${order.orderId}/confirm`, "POST", {});
  await call(page.request, `/staff/order-items/${order.items[0].id}/served`, "PATCH", { served: true });
  const quote = (await (await call(page.request, `/staff/table-sessions/${order.sessionId}/bill`)).json()).data;
  const paymentKey = randomUUID();
  expect((await call(page.request, `/staff/table-sessions/${order.sessionId}/payments`, "POST", { idempotencyKey: paymentKey, expectedSessionRevision: quote.sessionRevision, expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: "100000" }, paymentKey)).status()).toBe(201);
  await page.goto("/admin/reports");
  await expect(page.locator(".report-summary")).toContainText(/Rp\s*50\.000/);
  await expect(page.getByRole("img", { name: "Pendapatan lunas harian" })).toBeVisible();
  await page.getByText("Lihat angka harian", { exact: true }).click();
  await expect(page.getByRole("table").first()).toContainText(/Rp\s*50\.000/);
  await expect(page.getByRole("table").last()).toContainText(data.menuName);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("customer, cashier and every Admin menu fit their device sizes and pass axe", async ({ page, data }, testInfo) => {
  const targets = [
    { path: `/order/${data.token}`, width: 360, height: 800, name: "customer-name" },
    { path: "/pos", width: 1024, height: 768, name: "cashier" },
    { path: "/admin/menus", width: 1440, height: 1000, name: "admin-menus" },
    { path: "/admin/tables", width: 390, height: 844, name: "admin-tables-mobile" },
    { path: "/admin/settings", width: 1440, height: 1000, name: "admin-settings" },
    { path: "/admin/staff", width: 390, height: 844, name: "admin-staff-mobile" },
    { path: "/admin/reports", width: 1440, height: 1000, name: "admin-reports" },
    { path: "/pos/reservations", width: 390, height: 844, name: "reservations-mobile" },
  ];
  await signIn(page, "admin");
  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height }); await page.goto(target.path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator(".loading-block")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), target.name).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, target.name).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}.png`), fullPage: true });
  }
  await page.goto("/reset-password?token=e2e-reset-token");
  await page.getByLabel("Kata sandi baru", { exact: true }).fill("example-reset-password");
  await page.getByLabel("Konfirmasi kata sandi", { exact: true }).fill("example-reset-password");
  await page.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(page.getByRole("status")).toContainText("Kata sandi tersimpan");
});
