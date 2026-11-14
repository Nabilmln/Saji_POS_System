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
  const index = cart.findIndex((current) => current.id === item.id);
  if (quantity === 0) {
    return cart.filter((current) => current.id !== item.id);
  }
  const existing = index >= 0 ? cart[index] : undefined;
  const imageUrl = item.imageUrl !== undefined ? item.imageUrl : existing?.imageUrl;
  const updatedItem: CartItem = { ...item, ...(imageUrl !== undefined ? { imageUrl } : {}), quantity };
  if (index >= 0) {
    const next = [...cart];
    next[index] = updatedItem;
    return next;
  }
  return [...cart, updatedItem];
}

export function cartSubtotal(cart: CartItem[]): bigint {
  return cart.reduce((total, item) => total + BigInt(item.priceIdr) * BigInt(item.quantity), 0n);
}

export function formatIdr(value: bigint | string): string {
  const amount = BigInt(value);
  const formatted = new Intl.NumberFormat("id-ID").format(amount < 0n ? -amount : amount);
  return amount < 0n ? `-Rp ${formatted}` : `Rp ${formatted}`;
}
