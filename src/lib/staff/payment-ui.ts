export type BillQuote = {
  sessionId: string; tableId: string; tableNumber: string;
  sessionRevision: string; settingsVersion: string; subtotalIdr: string;
  discount: { enabled: boolean; configuredAmountIdr: string; appliedAmountIdr: string };
  tax: { enabled: boolean; rateBps: number; amountIdr: string };
  grandTotalIdr: string; paymentEligible: boolean;
  blockingOrders: { orderId: string; status: string; unservedItemCount: number }[];
  calculatedAt: string;
};

export function quoteChanged(previous: BillQuote, next: BillQuote): boolean {
  return previous.sessionRevision !== next.sessionRevision || previous.settingsVersion !== next.settingsVersion;
}

export function cashChange(quote: BillQuote | null, cash: string): bigint | null {
  if (!quote || !/^(0|[1-9]\d{0,15})$/.test(cash) || BigInt(cash) > 9_000_000_000_000_000n) return null;
  const difference = BigInt(cash) - BigInt(quote.grandTotalIdr);
  return difference >= 0n ? difference : null;
}

export function canSubmitPayment(quote: BillQuote | null, cash: string, reviewed: boolean): boolean {
  return !!quote?.paymentEligible && reviewed && cashChange(quote, cash) !== null;
}
