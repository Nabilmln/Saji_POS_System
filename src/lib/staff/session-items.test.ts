import { expect, it } from "vitest";
import { sessionItems } from "./session-items";

it("combines only active quantities and preserves different price snapshots", () => {
  const water = { menuItemId: "water", menuName: "Water", quantity: 1, unitPriceIdr: "5000", lineTotalIdr: "5000", voided: false };
  expect(sessionItems([{ items: [water] }, { items: [water, { ...water, voided: true }] }])).toEqual([
    { menuName: "Water", quantity: 2, lineTotalIdr: "10000" },
  ]);
  expect(sessionItems([{ items: [water, { ...water, unitPriceIdr: "7000", lineTotalIdr: "7000" }] }])).toHaveLength(2);
});
