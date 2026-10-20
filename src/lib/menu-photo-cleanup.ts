import "server-only";
import { eq, or, sql } from "drizzle-orm";
import type { db } from "../db";
import { menuItems } from "../db/schema";
import { apiError } from "./api-response";
import { MENU_IMAGE_PATH } from "./menu-images";
import { listMenuImages, menuImageObject } from "./menu-image-storage";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockPhoto(tx: Transaction, path: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${path}, 0))`);
}

export async function checkMenuPhoto(tx: Transaction, imageUrl: string | null, origin: string) {
  if (!imageUrl) return;
  const url = new URL(imageUrl, origin);
  if (!MENU_IMAGE_PATH.test(url.pathname)) return;
  await lockPhoto(tx, url.pathname);
  if (url.origin !== origin) return;
  try {
    const response = await menuImageObject(url.pathname.slice("/api/menu-images/".length), { method: "HEAD" });
    if (response.status === 404) return apiError(422, "IMAGE_NOT_FOUND", "Photo was removed; choose and upload it again");
    if (!response.ok) return apiError(503, "IMAGE_UPLOAD_FAILED", "Image storage unavailable; try again");
  } catch { return apiError(503, "IMAGE_UPLOAD_FAILED", "Image storage unavailable; try again"); }
}

export async function cleanupMenuPhotos(database: typeof db, apply = false) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const result = { scanned: 0, recent: 0, referenced: 0, candidates: [] as string[], deleted: 0 };
  for await (const image of listMenuImages()) {
    result.scanned++;
    if (image.modifiedAt >= cutoff) { result.recent++; continue; }
    const path = `/api/menu-images/${image.id}`;
    await database.transaction(async (tx) => {
      await lockPhoto(tx, path);
      // Include archived menus and legacy absolute URLs; both can still display this photo.
      const [reference] = await tx.select({ id: menuItems.id }).from(menuItems).where(or(
        eq(menuItems.imageUrl, path),
        sql`split_part(split_part(${menuItems.imageUrl}, '?', 1), '#', 1) LIKE ${`%${path}`}`,
      )).limit(1);
      if (reference) { result.referenced++; return; }
      result.candidates.push(`menus/${image.id}.webp`);
      if (apply) {
        const response = await menuImageObject(image.id, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error("Menu photo deletion failed; rerun cleanup to retry");
        result.deleted++;
      }
    });
  }
  return result;
}
