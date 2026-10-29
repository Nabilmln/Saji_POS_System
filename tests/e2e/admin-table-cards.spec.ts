import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

test("compact owner table cards keep QR, editing and status restrictions", async ({ page, data }, testInfo) => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const longNumber = "Garden-12345678901234567890123";
  try {
    await data.pool.query("INSERT INTO dining_tables(id,table_number,qr_token,status,is_active) VALUES($1,$2,$3,'AVAILABLE',false),($4,'Occupied card',$5,'OCCUPIED',true),($6,'Reserved card',$7,'RESERVED',true)", [ids[0], longNumber, randomUUID(), ids[1], randomUUID(), ids[2], randomUUID()]);
    await signIn(page, "admin");
    await page.goto("/admin/tables");
    const card = page.getByRole("article", { name: `Meja ${data.tableNumber}`, exact: true });
    await expect(card).toBeVisible();
    await expect(card.locator("header .status-chip")).toHaveText("Tersedia");
    await expect(card).toContainText("Pemesanan QR");
    await expect(card.locator(".active")).toHaveText("Aktif");
    await expect(page.getByRole("table")).toHaveCount(0);
    const inactive = page.getByRole("article", { name: `Meja ${longNumber}`, exact: true });
    await expect(inactive.getByRole("button", { name: "Lihat QR", exact: true })).toBeDisabled();
    await expect(inactive).toContainText("Nonaktif");
    for (const number of ["Occupied card", "Reserved card"]) {
      const busy = page.getByRole("article", { name: `Meja ${number}`, exact: true });
      for (const name of ["Ubah nomor", "Hapus"]) await expect(busy.getByRole("button", { name, exact: true })).toBeDisabled();
      await expect(busy.getByRole("switch")).toBeDisabled();
      await expect(busy.getByRole("button", { name: "Lihat QR", exact: true })).toBeEnabled();
    }
    await card.getByRole("button", { name: "Lihat QR", exact: true }).click();
    await expect(page.locator(".workspace-detail").getByRole("img", { name: `Kode QR untuk pemesanan Meja ${data.tableNumber}`, exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Lihat QR", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Unduh QR (SVG)", exact: true })).toHaveAttribute("download", /-qr\.svg$/);
    await expect(page.locator(".workspace-detail").getByLabel("Tautan tujuan", { exact: true })).toHaveValue(`http://localhost:3100/order/${data.token}`);
    for (const [width, language, theme] of [[1440, "id", "light"], [1024, "id", "dark"], [390, "en", "light"], [320, "en", "dark"]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      if (language === "en") await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(page.getByRole("article", { name: `${language === "en" ? "Table" : "Meja"} ${data.tableNumber}`, exact: true })).toBeVisible();
      const sizes = await page.locator(".admin-table-card").evaluateAll((cards) => cards.map((card) => ({
        height: card.getBoundingClientRect().height,
        fits: card.scrollWidth <= card.clientWidth + 1,
        controlsFit: [...card.querySelectorAll("button")].every((button) => button.scrollWidth <= button.clientWidth + 1 && button.getBoundingClientRect().height >= 32),
      })));
      for (const size of sizes) { expect(size.fits).toBe(true); expect(size.controlsFit).toBe(true); expect(size.height).toBeLessThanOrEqual(220); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const cardsBox = await page.locator(".admin-table-grid").boundingBox();
      const pagerBox = await page.locator(".pagination-panel").boundingBox();
      expect(pagerBox!.y - (cardsBox!.y + cardsBox!.height)).toBeGreaterThanOrEqual(16);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`admin-table-cards-${width}-${language}-${theme}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
    await card.getByRole("button", { name: "Ubah nomor", exact: true }).click();
    await page.getByLabel("Nomor meja *", { exact: true }).fill(`${data.tableNumber}-new`);
    await page.getByRole("button", { name: "Simpan Meja", exact: true }).click();
    const renamed = page.getByRole("article", { name: `Meja ${data.tableNumber}-new`, exact: true });
    await expect(renamed).toBeVisible();
    await renamed.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(renamed).toBeVisible();
    await renamed.getByRole("switch").click();
    await expect(renamed.getByRole("button", { name: "Lihat QR", exact: true })).toBeDisabled();
  } finally { await data.pool.query("DELETE FROM dining_tables WHERE id=ANY($1::uuid[])", [ids]); }
});
