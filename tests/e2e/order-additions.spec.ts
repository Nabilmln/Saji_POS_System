import { test, expect, guestOrder, signIn, call } from "./fixtures";

test("additional guest orders send only the new cart and combine session quantities", async ({ page, data }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /async Client Component|uncached promise/.test(message.text())) errors.push(message.text());
  });
  await guestOrder(page, data.token, "Guest", data.menuName);
  await page.getByRole("button", { name: "Tambah pesanan", exact: true }).click();
  await expect(page.getByRole("button", { name: /Lihat Keranjang/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Tambahkan Teh Demo ke keranjang", exact: true }).click();
  await page.getByRole("button", { name: /Lihat Keranjang/ }).click();
  await expect(page.locator(".cart-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Konfirmasi Pesanan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Status pesanan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tambah pesanan", exact: true }).click();
  await page.getByRole("button", { name: `Tambahkan ${data.menuName} ke keranjang`, exact: true }).click();
  await page.getByRole("button", { name: /Lihat Keranjang/ }).click();
  await page.getByRole("button", { name: "Konfirmasi Pesanan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Status pesanan", exact: true })).toBeVisible();
  await signIn(page);
  const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
  expect(table.orders).toHaveLength(3);
  expect(table.bill.subtotalIdr).toBe("60000");
  expect(table.orders.flatMap((order: { items: unknown[] }) => order.items)).toHaveLength(3);
  await page.goto(`/pos/tables/${data.tableId}`);
  await expect(page.locator(".pos-item").filter({ hasText: data.menuName })).toHaveCount(2);
  await expect(page.locator(".session-tally")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("manual additions keep an uncertain submission locked and replay it once", async ({ page, data }) => {
  await signIn(page); await page.goto(`/pos/tables/${data.tableId}`);
  await page.getByRole("button", { name: "Tambah order manual" }).click();
  await page.getByLabel("Nama pelanggan / label").fill("Guest");
  await page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true }).click();
  await page.route("**/api/staff/tables/*/orders", async (route) => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "Simpan order Menunggu" }).click();
  await expect(page.getByRole("button", { name: "Coba Lagi dengan Aman" })).toBeVisible();
  await expect(page.getByLabel("Nama pelanggan / label")).toBeDisabled();
  await page.reload(); await page.getByRole("button", { name: "Tambah order manual" }).click();
  await expect(page.getByLabel("Nama pelanggan / label")).toBeDisabled();
  await page.getByRole("button", { name: "Coba Lagi dengan Aman" }).click();
  await expect(page.getByRole("button", { name: "Simpan order Menunggu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Tambah order manual" }).click();
  await expect(page.getByLabel("Nama pelanggan / label")).toHaveValue("");
  await expect(page.locator(".summary-card")).toHaveCount(0);
  await page.getByLabel("Nama pelanggan / label").fill("Guest");
  await page.getByRole("button", { name: `Tambah ${data.menuName}`, exact: true }).click();
  await page.getByRole("button", { name: "Simpan order Menunggu" }).click();
  await expect(page.locator(".pos-item").filter({ hasText: data.menuName })).toHaveCount(2);
  const table = (await (await call(page.request, `/staff/tables/${data.tableId}`)).json()).data;
  expect(table.orders).toHaveLength(2);
  expect(table.bill.subtotalIdr).toBe("50000");
  expect(table.orders.map((order: { items: { quantity: number }[] }) => order.items[0].quantity)).toEqual([1, 1]);
});
