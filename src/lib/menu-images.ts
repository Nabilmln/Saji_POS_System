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
