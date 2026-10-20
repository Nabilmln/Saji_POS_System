import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/guards";
import { apiError, apiSuccess } from "@/lib/api-response";
import { menuImageObject, readMenuImage } from "@/lib/menu-image-storage";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const image = await readMenuImage(request);
  if (image instanceof Response) return image;
  try {
    const id = randomUUID();
    const result = await menuImageObject(id, { method: "PUT", body: new Uint8Array(image), headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
    if (!result.ok) return apiError(503, "IMAGE_UPLOAD_FAILED", "Image upload unavailable; try again");
    return apiSuccess({ imageUrl: `/api/menu-images/${id}` }, 201);
  } catch {
    return apiError(503, "IMAGE_UPLOAD_FAILED", "Image upload unavailable; try again");
  }
}
