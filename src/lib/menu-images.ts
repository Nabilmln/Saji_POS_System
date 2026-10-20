export const MAX_MENU_IMAGE_BYTES = 3 * 1024 * 1024;
export const MENU_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MENU_IMAGE_PATH = /^\/api\/menu-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const illustrations: Record<string, string> = {
  "nasi goreng": "/images/menu/nasi-goreng.webp",
  "mie goreng": "/images/menu/mie-goreng.webp",
  "es teh": "/images/menu/es-teh.webp",
  "air mineral": "/images/menu/air-mineral.webp",
};

export function resolveMenuImage(imageUrl: string | null, menuName = "") {
  const key = menuName.trim().toLowerCase();
  return imageUrl || (Object.hasOwn(illustrations, key) ? illustrations[key] : null);
}
