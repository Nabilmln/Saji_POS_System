import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { test, expect, signIn, call } from "./fixtures";

test("cleanup removes only old unreferenced photos and rejects reattaching a removed upload", async ({ page, data }) => {
  await signIn(page, "admin");
  const upload = async () => {
    const response = await page.request.post("/api/admin/menu-images", { headers: { Origin: "http://localhost:3100" }, multipart: {
      file: { name: "photo.webp", mimeType: "image/webp", buffer: readFileSync("public/images/menu/es-teh.webp") },
    } });
    expect(response.status()).toBe(201);
    return (await response.json()).data.imageUrl as string;
  };
  const [used, archived, absolute, abandoned, removed] = await Promise.all([upload(), upload(), upload(), upload(), upload()]);
  expect((await call(page.request, `/admin/menus/${data.menuId}`, "PATCH", { imageUrl: used })).status()).toBe(200);
  expect((await call(page.request, `/admin/menus/${data.secondMenuId}`, "PATCH", { imageUrl: archived })).status()).toBe(200);
  expect((await call(page.request, `/admin/menus/${data.secondMenuId}`, "DELETE")).status()).toBe(200);
  const create = (name: string, imageUrl: string) => call(page.request, "/admin/menus", "POST", {
    categoryId: data.categoryId, name, description: null, imageUrl, priceIdr: "1000", isAvailable: true,
  });
  expect((await create("Legacy image alias", `https://pos.example.test${absolute}?v=1`)).status()).toBe(201);
  const cleared = await create("Removed photo", removed);
  expect(cleared.status()).toBe(201);
  expect((await call(page.request, `/admin/menus/${(await cleared.json()).data.id}`, "PATCH", { imageUrl: null })).status()).toBe(200);
  await page.request.post("http://127.0.0.1:3102/age-photos");
  const recent = await upload();
  const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/saji_e2e";
  const run = async (apply = false) => {
    const result = await promisify(execFile)(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/storage/cleanup-menu-photos.ts", ...(apply ? ["--apply"] : [])], {
      windowsHide: true,
      env: { ...process.env, DATABASE_URL_UNPOOLED: databaseUrl, AWS_ACCESS_KEY_ID: "e2e-storage-key", AWS_SECRET_ACCESS_KEY: "e2e-storage-secret", AWS_ENDPOINT_URL_S3: "http://127.0.0.1:3102", AWS_REGION: "ap-southeast-1" },
    });
    return JSON.parse(result.stdout) as { deleted: number; referenced: number; recent: number; candidates: string[]; mode: string };
  };
  const key = (path: string) => `menus/${path.split("/").at(-1)}.webp`;
  const before = (await data.pool.query("SELECT id,image_url,archived_at FROM menu_items WHERE category_id=$1 ORDER BY id", [data.categoryId])).rows;
  const preview = await run();
  expect(preview.mode).toBe("preview"); expect(preview.deleted).toBe(0);
  expect(preview.candidates).toEqual(expect.arrayContaining([key(abandoned), key(removed)]));
  expect(preview.referenced).toBeGreaterThanOrEqual(3); expect(preview.recent).toBeGreaterThanOrEqual(1);
  for (const path of [used, archived, absolute, abandoned, removed, recent]) expect((await page.request.get(path)).status()).toBe(200);
  await page.request.post("http://127.0.0.1:3102/fail-next-delete");
  await expect(run(true)).rejects.toThrow();
  expect((await page.request.get(abandoned)).status()).toBe(200);
  const applied = await run(true);
  expect(applied.mode).toBe("apply"); expect(applied.deleted).toBeGreaterThanOrEqual(2);
  for (const path of [used, archived, absolute, recent]) expect((await page.request.get(path)).status()).toBe(200);
  for (const path of [abandoned, removed]) expect((await page.request.get(path)).status()).toBe(404);
  expect((await data.pool.query("SELECT id,image_url,archived_at FROM menu_items WHERE category_id=$1 ORDER BY id", [data.categoryId])).rows).toEqual(before);
  expect((await run(true)).deleted).toBe(0);
  const stale = await call(page.request, `/admin/menus/${data.menuId}`, "PATCH", { imageUrl: abandoned });
  expect(stale.status()).toBe(422); expect((await stale.json()).error.code).toBe("IMAGE_NOT_FOUND");
  expect((await create("Stale upload", abandoned)).status()).toBe(422);
  expect((await data.pool.query("SELECT image_url FROM menu_items WHERE id=$1", [data.menuId])).rows[0].image_url).toBe(used);
});
