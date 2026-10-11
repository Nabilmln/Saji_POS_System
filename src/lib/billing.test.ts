import { expect, it } from "vitest";
import { calculateBill } from "./billing";

it("caps discount and rounds tax on the original subtotal", () => {
  expect(calculateBill(10_005n, {
    discountEnabled: true, discountAmountIdr: 20_000n, taxEnabled: true, taxRateBps: 1_000,
  })).toEqual({ subtotalIdr: "10005", discountIdr: "10005", taxIdr: "1001", grandTotalIdr: "1001" });
});

it("applies discount once and taxes the pre-discount subtotal", () => {
  expect(calculateBill(150_000n, {
    discountEnabled: true, discountAmountIdr: 10_000n, taxEnabled: true, taxRateBps: 1_000,
  })).toEqual({ subtotalIdr: "150000", discountIdr: "10000", taxIdr: "15000", grandTotalIdr: "155000" });
  expect(calculateBill(150_000n, {
    discountEnabled: false, discountAmountIdr: 10_000n, taxEnabled: false, taxRateBps: 1_000,
  }).grandTotalIdr).toBe("150000");
});
