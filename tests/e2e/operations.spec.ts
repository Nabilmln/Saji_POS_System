import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, call } from "./fixtures";

test("reservation creation, cancellation, check-in and empty-session closure work", async ({ page, data }) => {
  await signIn(page); await page.goto("/pos/reservations");
  async function reserve() {
    await page.getByRole("button", { name: "Tambah reservasi" }).click();
    await page.getByLabel("Nama pelanggan", { exact: true }).fill("Nadia Reservasi");
    await page.getByLabel("Kontak pelanggan").fill("08123456789");
    await page.getByRole("combobox", { name: "Meja tersedia" }).click();
    await page.getByRole("option", { name: `Meja ${data.tableNumber}`, exact: true }).click();
    await page.getByLabel("Waktu reservasi (WIB)", { exact: true }).fill("2026-10-20T12:30");
    await page.getByRole("button", { name: "Simpan reservasi" }).click();
    await expect(page.locator(".data-table tbody tr")).toContainText("Nadia Reservasi");
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

test("owner creates cashier credentials, protects own account and sees Paid-only bento reports", async ({ browser, page, data }, testInfo) => {
  await signIn(page, "admin"); await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Tambah Kasir" }).click();
  await page.getByLabel("Nama staf", { exact: true }).fill("Kasir Baru Demo");
  const email = `cashier-${randomUUID()}@example.test`, password = "cashier-created-password";
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi kasir", { exact: true }).fill(password);
  const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/staff") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Simpan staf", exact: true }).click();
  const response = await createdResponse; expect(response.status()).toBe(201);
  const created = (await response.json()).data; data.staffIds.push(created.userId);
  expect(JSON.stringify(created)).not.toContain(password);
  const audit = (await data.pool.query("SELECT details FROM audit_events WHERE entity_id=$1", [created.userId])).rows;
  expect(JSON.stringify(audit)).not.toContain(password);
  await expect(page.getByRole("status")).toContainText("Bagikan email dan kata sandi secara pribadi");
  const ownerRow = page.getByRole("row").filter({ hasText: "Test Admin" });
  await expect(ownerRow.getByRole("button", { name: "Nonaktifkan" })).toHaveCount(0);
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const protection = await call(page.request, `/admin/staff/${ownerId}`, "PATCH", { isActive: false });
  expect(protection.status()).toBe(409);
  expect((await protection.json()).error.code).toBe("OWNER_PROTECTED");
  expect((await call(page.request, "/staff/me")).status()).toBe(403);
  await expect(page.locator(".staff-sidebar a[href^='/pos']")).toHaveCount(0);
  const createdContext = await browser.newContext();
  const cashier = await createdContext.newPage();
  await cashier.goto("/login");
  await cashier.getByLabel("Email", { exact: true }).fill(email);
  await cashier.getByLabel("Kata sandi", { exact: true }).fill(password);
  await cashier.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(cashier).toHaveURL(/\/pos$/);
  expect((await call(cashier.request, "/admin/me")).status()).toBe(403);
  await expect(cashier.locator(".staff-sidebar a[href^='/admin']")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Kasir Baru Demo" });
  page.once("dialog", (dialog) => dialog.accept()); await row.getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row.getByRole("button", { name: "Aktifkan", exact: true })).toBeVisible();
  expect((await data.pool.query("SELECT is_active FROM staff_profiles WHERE user_id=$1", [created.userId])).rows[0].is_active).toBe(false);
  expect((await call(cashier.request, "/staff/me")).status()).toBe(403);
  await createdContext.close();

  const operationsContext = await browser.newContext();
  const operations = await operationsContext.newPage();
  await signIn(operations);

  const key = randomUUID();
  const order = (await (await call(operations.request, `/staff/tables/${data.tableId}/orders`, "POST", { clientRequestKey: key, customerName: "Paid report demo", items: [{ menuItemId: data.menuId, quantity: 2 }] }, key)).json()).data;
  await call(operations.request, `/staff/orders/${order.orderId}/confirm`, "POST", {});
  await call(operations.request, `/staff/order-items/${order.items[0].id}/served`, "PATCH", { served: true });
  const quote = (await (await call(operations.request, `/staff/table-sessions/${order.sessionId}/bill`)).json()).data;
  const paymentKey = randomUUID();
  expect((await call(operations.request, `/staff/table-sessions/${order.sessionId}/payments`, "POST", { idempotencyKey: paymentKey, expectedSessionRevision: quote.sessionRevision, expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: "100000" }, paymentKey)).status()).toBe(201);
  await operationsContext.close();
  await page.goto("/admin/reports");
  await expect(page.locator(".report-summary")).toContainText(/Rp\s*50\.000/);
  await expect(page.getByRole("img", { name: "Pendapatan lunas harian" })).toBeVisible();
  await page.getByText("Lihat angka harian", { exact: true }).click();
  await expect(page.getByRole("table").first()).toContainText(/Rp\s*50\.000/);
  await expect(page.locator(".top-menu-row")).toContainText(data.menuName);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("sales-bento-paid-light.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("sales-bento-paid-dark.png"), fullPage: true });
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
    { path: "/pos/transactions", width: 390, height: 844, name: "transactions-mobile" },
    { path: "/owner-login", width: 390, height: 844, name: "owner-login-mobile" },
    { path: "/login", width: 390, height: 844, name: "cashier-login-mobile" },
  ];
  let currentRole = "";
  for (const target of targets) {
    const role = target.path.startsWith("/admin") ? "admin" : target.path.startsWith("/pos") ? "cashier" : "";
    if (role && role !== currentRole) { await signIn(page, role); currentRole = role; }
    await page.setViewportSize({ width: target.width, height: target.height }); await page.goto(target.path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator(".loading-block")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), target.name).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, target.name).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}.png`), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    expect((await new AxeBuilder({ page }).analyze()).violations, `${target.name} dark`).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}-dark.png`), fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });
  }
  await page.goto("/reset-password?token=e2e-reset-token&role=ADMIN");
  await page.getByLabel("Kata sandi baru", { exact: true }).fill("example-reset-password");
  await page.getByLabel("Konfirmasi kata sandi", { exact: true }).fill("example-reset-password");
  await page.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(page.getByRole("status")).toContainText("Kata sandi tersimpan");
  await expect(page.getByRole("link", { name: "Masuk Pemilik" })).toHaveAttribute("href", "/owner-login");
});

test("mobile catalogue, cart and long category dropdown share accessible controls and photo fallback", async ({ page, data }, testInfo) => {
  const extraCategories = Array.from({ length: 6 }, () => randomUUID());
  try {
    for (const [index, id] of extraCategories.entries()) await data.pool.query("INSERT INTO categories(id,name) VALUES($1,$2)", [id, `Pilihan ${index}`]);
    await data.pool.query("UPDATE menu_items SET image_url='https://images.example.test/missing.jpg' WHERE id=$1", [data.menuId]);
    await page.route("https://images.example.test/**", (route) => route.abort());
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/order/${data.token}`);
    await page.getByLabel("Nama pemesan").fill("Rani");
    await page.getByRole("button", { name: "Lihat Menu", exact: true }).click();
    const dropdown = page.getByRole("combobox", { name: "Kategori" });
    await dropdown.click();
    await expect(page.getByRole("option")).toHaveCount(8);
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "Pilihan 5", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dropdown).toContainText("Pilihan 5");
    await dropdown.click(); await page.keyboard.press("Home");
    await expect(page.getByRole("option", { name: "Semua", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dropdown).toContainText("Semua");
    await expect(page.locator(".menu-card").filter({ hasText: data.menuName }).getByText("Tanpa foto")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("customer-catalogue.png"), fullPage: true });
    await page.getByRole("button", { name: `Tambahkan ${data.menuName} ke keranjang`, exact: true }).click();
    await page.getByRole("button", { name: /Lihat Keranjang/ }).click();
    await page.getByLabel(/Catatan/).fill("Tanpa sambal");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`customer-cart-${colorScheme}.png`), fullPage: true });
    }
  } finally { await data.pool.query("DELETE FROM categories WHERE id=ANY($1::uuid[])", [extraCategories]); }
});

test("role-specific login rejects the wrong account and public signup stays closed", async ({ page }) => {
  for (const [path, email, role] of [["/login", "admin@example.test", "kasir"], ["/owner-login", "cashier@example.test", "pemilik"]]) {
    await page.goto(path);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Kata sandi", { exact: true }).fill("e2e-only-password");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page.locator(".inline-alert[role=alert]")).toContainText(`tidak memiliki akses ${role}`);
    expect((await call(page.request, "/admin/me")).status()).toBe(401);
    expect((await call(page.request, "/staff/me")).status()).toBe(401);
    await expect(page.getByRole("link", { name: /Daftar|Sign up/i })).toHaveCount(0);
  }
  expect((await call(page.request, "/auth/sign-up/email", "POST", { email: "blocked@example.test", password: "not-a-live-password", name: "Blocked" })).status()).toBe(403);
});

test("shared dropdown supports keyboards and desktop panes keep QR and orders at the right", async ({ page, data }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "admin"); await page.goto("/admin/menus");
  const filter = page.getByRole("combobox", { name: "Kategori", exact: true });
  await filter.focus(); await page.keyboard.press("ArrowDown");
  await page.keyboard.type(`Demo ${data.categoryId}`); await page.keyboard.press("Enter");
  await expect(filter).toContainText(`Demo ${data.categoryId}`);
  await expect(page.locator(".admin-list-row").filter({ hasText: data.menuName })).toBeVisible();
  const availability = page.getByRole("group", { name: "Ketersediaan" });
  await availability.getByRole("radio", { name: "Tersedia", exact: true }).check();
  await expect(availability.getByRole("radio", { name: "Tersedia", exact: true })).toBeChecked();
  await page.goto("/admin/tables");
  await page.getByRole("row").filter({ hasText: data.tableNumber }).getByRole("button", { name: "Lihat QR" }).click();
  await expect(page.locator(".workspace-detail").getByRole("img", { name: `Kode QR untuk pemesanan Meja ${data.tableNumber}` })).toBeVisible();
  const sidebar = await page.locator(".staff-sidebar").boundingBox();
  const content = await page.locator(".staff-content").boundingBox();
  const detail = await page.locator(".workspace-detail").boundingBox();
  expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(content!.x);
  expect(content!.x + content!.width).toBeLessThanOrEqual(detail!.x);
  expect(await page.locator(".workspace-heading h1").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(24);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("owner-qr-three-columns.png"), fullPage: true });
  await signIn(page); await page.goto(`/pos/tables/${data.tableId}`);
  await expect(page.locator(".workspace-detail").getByRole("heading", { name: "Pesanan sesi ini", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("cashier-three-columns.png"), fullPage: true });
});
