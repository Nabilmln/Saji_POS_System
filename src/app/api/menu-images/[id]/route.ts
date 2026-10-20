import { apiError } from "@/lib/api-response";
import { menuImageObject } from "@/lib/menu-image-storage";
import { MENU_IMAGE_PATH } from "@/lib/menu-images";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!MENU_IMAGE_PATH.test(`/api/menu-images/${id}`)) return apiError(404, "IMAGE_NOT_FOUND", "Image not found");
  try {
    // Only normalized menu photos are public; other private bucket objects stay inaccessible.
    const result = await menuImageObject(id);
    if (result.status === 404) return apiError(404, "IMAGE_NOT_FOUND", "Image not found");
    if (!result.ok || !result.body) return apiError(503, "IMAGE_UNAVAILABLE", "Image unavailable");
    return new Response(result.body, { headers: {
      "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    } });
  } catch { return apiError(503, "IMAGE_UNAVAILABLE", "Image unavailable"); }
}
