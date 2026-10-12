import { describe, expect, it } from "vitest";
import { canSubmitPayment, cashChange, quoteChanged, type BillQuote } from "./payment-ui";

const quote: BillQuote = {
  sessionId: "session", tableId: "table", tableNumber: "05", sessionRevision: "8", settingsVersion: "4",
  subtotalIdr: "150000", discount: { enabled: true, configuredAmountIdr: "10000", appliedAmountIdr: "10000" },
  tax: { enabled: true, rateBps: 1000, amountIdr: "15000" }, grandTotalIdr: "155000",
  paymentEligible: true, blockingOrders: [], calculatedAt: "2026-10-10T06:40:00Z",
};

describe("cashier payment guards", () => {
  it("requires a reviewed, eligible bill and enough whole-rupiah cash", () => {
    expect(canSubmitPayment(quote, "155000", true)).toBe(true);
    expect(cashChange(quote, "200000")).toBe(45000n);
    expect(canSubmitPayment(quote, "154999", true)).toBe(false);
    expect(canSubmitPayment(quote, "155000.5", true)).toBe(false);
    expect(canSubmitPayment(quote, "155000", false)).toBe(false);
    expect(canSubmitPayment({ ...quote, paymentEligible: false }, "200000", true)).toBe(false);
  });

  it("invalidates review when either quote version changes even if the total stays equal", () => {
    expect(quoteChanged(quote, { ...quote, sessionRevision: "9" })).toBe(true);
    expect(quoteChanged(quote, { ...quote, settingsVersion: "5" })).toBe(true);
    expect(quoteChanged(quote, { ...quote, calculatedAt: "later" })).toBe(false);
  });
});
