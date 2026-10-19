import AxeBuilder from "@axe-core/playwright";
import { test, expect, call } from "./fixtures";

test("one login routes by the stored account role and keeps owner access exclusive", async ({ page }) => {
  expect((await call(page.request, "/me")).status()).toBe(401);
  await page.goto("/");
  await expect(page.locator(".entry-access a")).toHaveCount(1);
  await page.getByRole("link", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".login-form select,.login-form input[type=radio]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Daftar|Sign up/i })).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("cashier@example.test");
  await page.getByLabel("Kata sandi", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.locator(".inline-alert[role=alert]")).toContainText("Email atau kata sandi tidak sesuai.");
  expect((await call(page.request, "/me")).status()).toBe(401);

  for (const role of ["admin", "cashier"] as const) {
    await page.goto(role === "admin" ? "/login" : "/login?role=ADMIN");
    await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
    await page.getByLabel("Kata sandi", { exact: true }).fill("e2e-only-password");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    const destination = role === "admin" ? "/admin/reports" : "/pos";
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    const identity = await call(page.request, "/me?role=ADMIN");
    expect(identity.status()).toBe(200);
    expect(identity.headers()["cache-control"]).toBe("no-store");
    expect((await identity.json()).data.role).toBe(role === "admin" ? "ADMIN" : "CASHIER");
    const forbiddenApi = role === "admin" ? "/staff/me" : "/admin/me";
    expect((await call(page.request, forbiddenApi)).status()).toBe(403);
    expect((await call(page.request, "/auth/sign-up/email", "POST", { email: "blocked@example.test", password: "not-a-live-password", name: "Blocked" })).status()).toBe(403);
    if (role === "cashier") expect((await call(page.request, "/admin/staff", "POST", { role: "ADMIN" })).status()).toBe(403);
    await expect(page.locator(role === "admin" ? ".staff-sidebar a[href^='/pos']" : ".staff-sidebar a[href^='/admin']")).toHaveCount(0);
    await page.goto(role === "admin" ? "/pos" : "/admin/reports");
    await expect(page.getByRole("heading", { name: "Akses ditolak", exact: true })).toBeVisible();
    await page.goto(destination);
    await page.reload();
    await expect(page.locator(".staff-account-block")).toBeVisible();
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await call(page.request, "/me")).status()).toBe(401);
  }
});

test("shared sign-in rejects inactive and deleted profiles even with a valid Auth account", async ({ page, data }) => {
  const cashierId = "00000000-0000-4000-8000-000000000002";
  const previous = (await data.pool.query("SELECT is_active,deleted_at FROM staff_profiles WHERE user_id=$1", [cashierId])).rows[0];
  try {
    for (const state of ["inactive", "deleted"] as const) {
      await data.pool.query("UPDATE staff_profiles SET is_active=$2,deleted_at=$3 WHERE user_id=$1", [cashierId, state !== "inactive", state === "deleted" ? new Date() : null]);
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill("cashier@example.test");
      await page.getByLabel("Kata sandi", { exact: true }).fill("e2e-only-password");
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      await expect(page.locator(".inline-alert[role=alert]")).toContainText("Akun ini tidak memiliki akses aktif.");
      await expect(page).toHaveURL(/\/login$/);
      await expect.poll(async () => (await call(page.request, "/me")).status()).toBe(401);
      expect((await call(page.request, "/admin/me")).status()).toBe(401);
      expect((await call(page.request, "/staff/me")).status()).toBe(401);
    }
  } finally {
    await data.pool.query("UPDATE staff_profiles SET is_active=$2,deleted_at=$3 WHERE user_id=$1", [cashierId, previous.is_active, previous.deleted_at]);
  }
});

test("legacy owner links and password recovery use the shared localized login", async ({ page }, testInfo) => {
  await page.goto("/owner-login");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk ke Saji", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Saji");
  await expect(page.locator(".login-header .brand-mark img")).toHaveAttribute("src", "/icon.svg");
  await expect(page.locator("link[rel=icon][type='image/svg+xml']")).toHaveAttribute("href", /^\/icon\.svg/);
  const mark = await page.request.get("/icon.svg");
  expect(mark.status()).toBe(200);
  const vector = await mark.text();
  expect(vector).toContain('fill="#111111"');
  expect(vector).toContain('fill="#f5bb00"');
  const favicon = await page.request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  expect((await favicon.body()).readUInt16LE(2)).toBe(1);
  for (const [width, theme] of [[1280, "light"], [1024, "dark"], [390, "light"], [320, "dark"]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    if (width === 390) await page.getByRole("button", { name: "English", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".login-brand-panel")).toBeVisible({ visible: width >= 640 });
    await expect(page.getByRole("button", { name: width >= 640 ? "Masuk" : "Sign in", exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`shared-login-${width}-${theme}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
  await page.getByRole("button", { name: "Lupa kata sandi?", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  const resetRequest = page.waitForRequest((request) => request.url().endsWith("/api/auth/request-password-reset"));
  await page.getByRole("button", { name: "Kirim tautan pengaturan", exact: true }).click();
  expect((await resetRequest).postDataJSON().redirectTo).toBe("http://localhost:3100/reset-password");
  await expect(page.locator(".inline-alert[role=status]")).toContainText("Jika akun ini terdaftar");
  await page.goto("/reset-password?token=e2e-reset-token&role=ADMIN");
  await page.getByLabel("Kata sandi baru", { exact: true }).fill("example-reset-password");
  await page.getByLabel("Konfirmasi kata sandi", { exact: true }).fill("example-reset-password");
  await page.getByRole("button", { name: "Simpan kata sandi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Kata sandi tersimpan");
  await expect(page.getByRole("link", { name: "Masuk", exact: true })).toHaveAttribute("href", "/login");
});
