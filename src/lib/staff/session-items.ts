type Item = { menuItemId?: string | null; menuName: string; unitPriceIdr?: string; quantity: number; lineTotalIdr: string; voided: boolean };

export function sessionItems(orders: { items: Item[] }[]) {
  const totals = new Map<string, { menuName: string; quantity: number; lineTotalIdr: string }>();
  for (const item of orders.flatMap((order) => order.items)) {
    if (item.voided) continue;
    // Keep differently priced snapshots separate even when the menu ID matches.
    const key = JSON.stringify([item.menuItemId ?? item.menuName, item.menuName, item.unitPriceIdr]);
    const saved = totals.get(key);
    totals.set(key, { menuName: item.menuName, quantity: (saved?.quantity ?? 0) + item.quantity,
      lineTotalIdr: (BigInt(saved?.lineTotalIdr ?? "0") + BigInt(item.lineTotalIdr)).toString() });
  }
  return [...totals.values()];
}
