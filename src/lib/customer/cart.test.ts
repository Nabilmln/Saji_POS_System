import { describe, expect, it } from "vitest";
import { cartSubtotal, changeCart } from "./cart";

const item = { id: "a", name: "Nasi", priceIdr: "25000", quantity: 1, note: "" };
describe("customer cart", () => {
  it("replaces, removes, and caps quantity before checkout", () => {
    expect(changeCart([item], item, 2)).toEqual([{ ...item, quantity: 2 }]);
    expect(changeCart([item], item, 0)).toEqual([]);
    expect(changeCart([item], item, 100)).toEqual([item]);
  });
  it("totals integer rupiah without floating point loss", () => {
    expect(cartSubtotal([{ ...item, quantity: 3 }])).toBe(75000n);
  });
});
