import { expect, it } from "vitest";
import { calculateBill } from "./billing";

it("caps discount and rounds tax on the original subtotal", () => {
  expect(calculateBill(10_005n, {
    discountEnabled: true, discountAmountIdr: 20_000n, taxEnabled: true, taxRateBps: 1_000,
  })).toEqual({ subtotalIdr: "10005", discountIdr: "10005", taxIdr: "1001", grandTotalIdr: "1001" });
});
