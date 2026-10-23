import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, confirmAction } from "./fixtures";

test("table notices emphasize safe text, translate, fit and reappear after dismissal or timeout", async ({ page, data }, testInfo) => {
  const number = "01 <b>**{0}**</b>";
  await data.pool.query("UPDATE dining_tables SET table_number=$1 WHERE id=$2", [number, data.tableId]);
  await signIn(page, "admin");
  await page.goto("/admin/tables");
  const card = page.getByRole("article", { name: `Meja ${number}`, exact: true });
  await expect(card).toBeVisible();
  const toast = page.locator(".toast");
  async function toggle(name: string) {
    await card.getByRole("button", { name, exact: true }).click();
    await confirmAction(page, name);
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCount(1);
  }
  await toggle("Nonaktifkan");
  await expect(toast.locator("strong")).toHaveText([`Meja ${number}`, "Nonaktif"]);
  await expect(toast.locator("b,img,script")).toHaveCount(0);
  for (const [width, language, theme] of [[1440, "id", "light"], [1024, "id", "dark"], [390, "en", "light"], [320, "en", "dark"]] as const) {
    if (width !== 1440) {
      await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
      await toggle("Aktifkan");
      await expect(toast.locator("strong").last()).toHaveText("Aktif");
      await toggle("Nonaktifkan");
      await expect(toast.locator("strong").last()).toHaveText("Nonaktif");
    }
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    if (language === "en") await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(toast.locator("strong")).toHaveText([`${language === "en" ? "Table" : "Meja"} ${number}`, language === "en" ? "Inactive" : "Nonaktif"]);
    expect(await toast.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1;
    })).toBe(true);
    if (width < 640) {
      const noticeBox = await toast.boundingBox();
      const navigationBox = await page.locator(".staff-sidebar").boundingBox();
      expect(noticeBox!.y).toBeGreaterThanOrEqual(navigationBox!.y + navigationBox!.height);
    }
    await expect(toast.locator("strong").first()).toHaveCSS("font-weight", "700");
    expect((await new AxeBuilder({ page }).include(".toast").analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`notice-${width}-${language}-${theme}.png`) });
  }
  await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
  await expect(toast).toHaveCount(0);
  await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click();
  await expect(toast).toHaveCount(0);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await toggle("Aktifkan");
  await expect(toast.locator("strong")).toHaveText([`Meja ${number}`, "Aktif"]);
  await toggle("Nonaktifkan");
  await expect(toast.locator("strong")).toHaveText([`Meja ${number}`, "Nonaktif"]);
  await page.clock.runFor(10_001);
  await expect(toast).toHaveCount(0);
  await toggle("Aktifkan");
  await expect(toast.locator("strong")).toHaveText([`Meja ${number}`, "Aktif"]);
  await page.emulateMedia({ media: "print" });
  await expect(toast).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(toast).toBeVisible();
  await page.clock.resume();
  await page.route(`**/api/admin/tables/${data.tableId}`, (route) => route.abort("failed"), { times: 1 });
  await toggle("Nonaktifkan");
  await expect(toast).toHaveAttribute("role", "alert");
  await expect(toast).toHaveAttribute("data-tone", "error");
  await expect(toast).toContainText(`Status Meja ${number} belum dapat diperbarui.`);
  await expect(page.getByRole("article", { name: `Meja ${number}`, exact: true }).getByRole("button", { name: "Nonaktifkan", exact: true })).toBeEnabled();
});
