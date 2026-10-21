import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./fixtures";

const origin = { Origin: "http://localhost:3100" };
const upload = { name: "menu.webp", mimeType: "image/webp", buffer: readFileSync("public/images/menu/es-teh.webp") };

test("photo upload feedback is immediate, localized and follows the actual upload result", async ({ page, data }, testInfo) => {
  await signIn(page, "admin");
  await page.goto("/admin/menus");
  await page.getByRole("button", { name: "Tambah Menu", exact: true }).click();
  await page.getByRole("combobox", { name: "Kategori *", exact: true }).click();
  await page.getByRole("option", { name: `Demo ${data.categoryId}`, exact: true }).click();
  await page.getByLabel("Nama menu *", { exact: true }).fill(`Upload feedback ${data.menuId}`);
  await page.getByLabel("Harga (Rp) *", { exact: true }).fill("12000");
  await page.getByLabel("Unggah foto menu", { exact: true }).setInputFiles(upload);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/admin/menu-images", async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: { code: "IMAGE_UPLOAD_FAILED" } } });
  }, { times: 1 });
  try {
    const feedbackMs = await page.evaluate(() => new Promise<number>((resolve) => {
      const status = document.querySelector(".photo-upload-status")!;
      const start = performance.now();
      const observer = new MutationObserver(() => {
        if (status.querySelector(".processing-spinner")) { observer.disconnect(); resolve(performance.now() - start); }
      });
      observer.observe(status, { childList: true, subtree: true });
      document.querySelector<HTMLFormElement>(".detail-pane .admin-form")!.requestSubmit();
    }));
    testInfo.annotations.push({ type: "feedback", description: `Local upload feedback: ${feedbackMs.toFixed(1)} ms (target <200 ms; budget <500 ms)` });
    expect(feedbackMs).toBeLessThan(500);
    const status = page.locator(".photo-upload-status");
    const spinner = status.locator(".processing-spinner");
    await expect(status).toContainText("Mengunggah foto…");
    await expect(spinner).toHaveAttribute("aria-hidden", "true");
    await page.locator(".workspace-detail").focus();
    await expect(page.locator(".workspace-detail")).toBeFocused();
    await expect(page.getByRole("button", { name: "Menyimpan…", exact: true })).toBeDisabled();
    for (const [width, language, theme] of [[1280, "id", "light"], [390, "en", "dark"]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
      if (language === "en") await page.getByRole("button", { name: "English", exact: true }).click();
      await status.scrollIntoViewIfNeeded();
      await expect(status).toHaveText(language === "en" ? "Uploading photo…" : "Mengunggah foto…");
      expect(await spinner.evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0.5s");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`photo-processing-${width}-${language}.png`), fullPage: true });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await expect(spinner).toBeVisible();
    expect((await data.pool.query("SELECT id FROM menu_items WHERE category_id=$1 AND name=$2", [data.categoryId, `Upload feedback ${data.menuId}`])).rowCount).toBe(0);
  } finally { release(); }
  await expect(page.locator(".inline-alert[role=alert]")).toContainText("The photo could not be uploaded.");
  await expect(page.locator(".processing-spinner")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveAttribute("src", /^blob:/);
  let finishSave!: () => void;
  const saving = new Promise<void>((resolve) => { finishSave = resolve; });
  await page.route("**/api/admin/menus", async (route) => { await saving; await route.continue(); }, { times: 1 });
  await page.route("**/api/admin/menu-images", async (route) => {
    const start = performance.now();
    const response = await route.fetch();
    testInfo.annotations.push({ type: "upload", description: `Local fixture upload HTTP request: ${(performance.now() - start).toFixed(1)} ms` });
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.getByRole("button", { name: "Save menu item", exact: true }).click();
    await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveAttribute("src", /^\/api\/menu-images\//);
    await expect(page.locator(".processing-spinner")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  } finally { finishSave(); }
  await expect(page.locator(".inline-alert[role=status]")).toContainText("Menu item saved.");
});

test("only the owner can upload menu photos and invalid files never reach storage", async ({ page }) => {
  const post = (file = upload) => page.request.post("/api/admin/menu-images", { headers: origin, multipart: { file } });
  expect((await post()).status()).toBe(401);
  await signIn(page);
  expect((await post()).status()).toBe(403);
  await signIn(page, "admin");
  expect((await page.request.post("/api/admin/menu-images", { headers: { Origin: "https://other.example" }, multipart: { file: upload } })).status()).toBe(403);
  for (const file of [
    { name: "fake.png", mimeType: "image/png", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>') },
    { name: "corrupt.webp", mimeType: "image/webp", buffer: Buffer.from("broken") },
    { name: "image.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
  ]) expect((await post(file)).status()).toBe(422);
  expect((await post({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024 + 1) })).status()).toBe(413);
  expect((await page.request.get("/api/menu-images/not-an-id")).status()).toBe(404);
  expect((await page.request.get("/api/menu-images/11111111-1111-4111-8111-111111111111")).status()).toBe(404);
});

test("owner previews, retries and saves a photo shared with cashier and customer menus", async ({ browser, page, data }, testInfo) => {
  const name = `Photo ${data.menuId}`;
  await signIn(page, "admin");
  await page.goto("/admin/menus");
  await page.getByRole("button", { name: "Tambah Menu", exact: true }).click();
  await expect(page.getByLabel("Unggah foto menu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("combobox", { name: "Category *", exact: true }).click();
  await page.getByRole("option", { name: `Demo ${data.categoryId}`, exact: true }).click();
  await page.getByLabel("Menu item name *", { exact: true }).fill(name);
  await page.getByLabel("Price (IDR) *", { exact: true }).fill("12000");
  const picker = page.getByLabel("Upload menu photo", { exact: true });
  await picker.setInputFiles({ name: "file.gif", mimeType: "image/gif", buffer: Buffer.from("GIF") });
  await expect(page.locator("#menu-photo-error")).toContainText("Choose a valid JPG, PNG, or WebP photo.");
  await expect(page.getByRole("button", { name: "Save menu item", exact: true })).toBeDisabled();
  await picker.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024 + 1) });
  await expect(page.locator("#menu-photo-error")).toContainText("Photos must be 3 MB or smaller.");
  await picker.setInputFiles(upload);
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveJSProperty("naturalWidth", 640);
  await page.getByRole("button", { name: "Cancel photo selection", exact: true }).click();
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveCount(0);
  const dropped = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "dropped-menu.webp", { type: "image/webp" }));
    return transfer;
  }, [...upload.buffer]);
  try {
    const zone = page.locator(".menu-photo-dropzone");
    await zone.dispatchEvent("dragover", { dataTransfer: dropped });
    await expect(zone).toHaveClass(/is-dragging/);
    await zone.dispatchEvent("drop", { dataTransfer: dropped });
    await expect(zone).not.toHaveClass(/is-dragging/);
    await expect(page.locator(".menu-photo-filename")).toHaveText("dropped-menu.webp");
    await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveJSProperty("naturalWidth", 640);
  } finally { await dropped.dispose(); }
  await picker.focus();
  await expect(picker).toBeFocused();
  await expect(page.locator(".admin-form input[type=url]")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overflow = await page.locator(".detail-pane .admin-form").evaluate((form) => {
      const bounds = form.getBoundingClientRect();
      return [...form.querySelectorAll("*")].filter((element) => element.getBoundingClientRect().right > bounds.right + 1).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right, formRight: bounds.right, columns: getComputedStyle(element).gridTemplateColumns }));
    });
    expect(overflow).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`menu-upload-${width}.png`), fullPage: true });
  }
  await page.request.post("http://127.0.0.1:3102/fail-next-upload");
  await page.getByRole("button", { name: "Save menu item", exact: true }).click();
  await expect(page.locator(".inline-alert[role=alert]")).toContainText("The photo could not be uploaded.");
  expect((await data.pool.query("SELECT id FROM menu_items WHERE category_id=$1 AND name=$2", [data.categoryId, name])).rowCount).toBe(0);
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Save menu item", exact: true }).click();
  await expect(page.locator(".inline-alert[role=status]")).toContainText("Menu item saved.");
  const saved = (await data.pool.query("SELECT id,image_url FROM menu_items WHERE category_id=$1 AND name=$2", [data.categoryId, name])).rows[0];
  expect(saved.image_url).toMatch(/^\/api\/menu-images\/[0-9a-f-]+$/);
  const imagePath = new RegExp(`${saved.image_url}$`);
  const image = await page.request.get(saved.image_url);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");
  expect(image.headers()["cache-control"]).toContain("immutable");
  expect(image.headers()["x-content-type-options"]).toBe("nosniff");
  await page.reload();
  await page.getByLabel("Search menu", { exact: true }).fill(name);
  const card = page.locator(".admin-menu-card").filter({ hasText: name });
  await expect(card.getByRole("img", { name, exact: true })).toHaveAttribute("src", imagePath);
  await expect(card.locator(".photo-caption")).toHaveCount(0);
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveAttribute("src", imagePath);
  await expect(page.locator(".admin-form input[type=url]")).toHaveCount(0);
  await page.getByLabel("Price (IDR) *", { exact: true }).fill("13000");
  await page.getByRole("button", { name: "Save menu item", exact: true }).click();
  await expect(page.locator(".inline-alert[role=status]")).toContainText("Menu item saved.");
  expect((await data.pool.query("SELECT image_url FROM menu_items WHERE id=$1", [saved.id])).rows[0].image_url).toBe(saved.image_url);

  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    expect((await guest.request.get(saved.image_url)).status()).toBe(200);
    await guest.goto(`/order/${data.token}`);
    await guest.getByLabel("Nama pemesan *", { exact: true }).fill("Photo guest");
    await guest.getByRole("button", { name: "Lihat Menu", exact: true }).click();
    const guestImage = guest.locator(".menu-card").filter({ hasText: name }).getByRole("img", { name, exact: true });
    await expect(guestImage).toHaveAttribute("src", imagePath);
    await expect(guestImage).toHaveJSProperty("naturalWidth", 640);
    await signIn(guest);
    await guest.goto(`/pos/tables/${data.tableId}`);
    await guest.getByRole("button", { name: "Tambah order manual", exact: true }).click();
    await expect(guest.locator(".menu-card").filter({ hasText: name }).getByRole("img", { name, exact: true })).toHaveAttribute("src", imagePath);
  } finally { await context.close(); }

  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("img", { name: "Menu photo preview", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save menu item", exact: true }).click();
  await expect(page.locator(".inline-alert[role=status]")).toContainText("Menu item saved.");
  expect((await data.pool.query("SELECT image_url FROM menu_items WHERE id=$1", [saved.id])).rows[0].image_url).toBeNull();
});
