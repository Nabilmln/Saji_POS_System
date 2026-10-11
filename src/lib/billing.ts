export function calculateBill(
  subtotal: bigint,
  settings: { discountEnabled: boolean; discountAmountIdr: bigint; taxEnabled: boolean; taxRateBps: number },
) {
  const discount = settings.discountEnabled
    ? (settings.discountAmountIdr < subtotal ? settings.discountAmountIdr : subtotal) : 0n;
  const tax = settings.taxEnabled ? (subtotal * BigInt(settings.taxRateBps) + 5_000n) / 10_000n : 0n;
  return {
    subtotalIdr: subtotal.toString(),
    discountIdr: discount.toString(),
    taxIdr: tax.toString(),
    grandTotalIdr: (subtotal - discount + tax).toString(),
  };
}
