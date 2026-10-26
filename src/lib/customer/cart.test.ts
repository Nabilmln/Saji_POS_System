import { describe, expect, it } from "vitest";
import { cartSubtotal, changeCart, formatIdr } from "./cart";

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
  it("formats currency in rupiah with dot thousand separators", () => {
    expect(formatIdr(0n)).toBe("Rp 0");
    expect(formatIdr("25000")).toBe("Rp 25.000");
    expect(formatIdr(1500000n)).toBe("Rp 1.500.000");
    expect(formatIdr(-10000n)).toBe("-Rp 10.000");
  });
});
