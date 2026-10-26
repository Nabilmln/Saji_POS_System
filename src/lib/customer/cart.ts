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

export function formatIdr(value: bigint | string): string {
  const amount = BigInt(value);
  const formatted = new Intl.NumberFormat("id-ID").format(amount < 0n ? -amount : amount);
  return amount < 0n ? `-Rp ${formatted}` : `Rp ${formatted}`;
}
