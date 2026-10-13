export type CartItem = { id: string; name: string; priceIdr: string; quantity: number; note: string };

export function changeCart(cart: CartItem[], item: CartItem, quantity: number): CartItem[] {
  if (quantity < 0 || quantity > 99 || !Number.isInteger(quantity)) return cart;
  const next = cart.filter((current) => current.id !== item.id);
  if (quantity) next.push({ ...item, quantity });
  return next;
}

export function cartSubtotal(cart: CartItem[]): bigint {
  return cart.reduce((total, item) => total + BigInt(item.priceIdr) * BigInt(item.quantity), 0n);
}

export function formatIdr(value: bigint | string, locale = "id-ID"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(BigInt(value));
}
