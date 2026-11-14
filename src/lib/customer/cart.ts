export type CartItem = {
  id: string;
  name: string;
  priceIdr: string;
  quantity: number;
  note: string;
  imageUrl?: string | null;
};

export function changeCart(cart: CartItem[], item: CartItem, quantity: number): CartItem[] {
  if (quantity < 0 || quantity > 99 || !Number.isInteger(quantity)) return cart;
  const existing = cart.find((current) => current.id === item.id);
  const next = cart.filter((current) => current.id !== item.id);
  if (quantity) {
    const imageUrl = item.imageUrl !== undefined ? item.imageUrl : existing?.imageUrl;
    next.push({ ...item, ...(imageUrl !== undefined ? { imageUrl } : {}), quantity });
  }
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
