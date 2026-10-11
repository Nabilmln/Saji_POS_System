import { expect, it } from "vitest";
import { checkoutFingerprint, manualOrderFingerprint } from "./checkout";

const tableId = "11111111-1111-4111-8111-111111111111";
const one = "22222222-2222-4222-8222-222222222222";
const two = "33333333-3333-4333-8333-333333333333";
const base = {
  expectedCycleNumber: 1,
  clientRequestKey: "44444444-4444-4444-8444-444444444444",
  items: [{ menuItemId: one, quantity: 2 }, { menuItemId: two, quantity: 1, note: "" }],
};

it("hashes normalized checkout content rather than item order or request key", () => {
  const original = checkoutFingerprint(tableId, "Aulia", base);
  expect(checkoutFingerprint(tableId, "Aulia", {
    ...base, clientRequestKey: "55555555-5555-4555-8555-555555555555",
    note: "", items: [...base.items].reverse(),
  })).toBe(original);
  expect(checkoutFingerprint(tableId, "Bima", base)).not.toBe(original);
  expect(checkoutFingerprint(tableId, "Aulia", { ...base, items: [{ menuItemId: one, quantity: 3 }] }))
    .not.toBe(original);
});

it("hashes manual order content independently from request key and line order", () => {
  const manual = { clientRequestKey: base.clientRequestKey, customerName: "Aulia", items: base.items };
  const original = manualOrderFingerprint(tableId, manual);
  expect(manualOrderFingerprint(tableId, {
    ...manual, clientRequestKey: "55555555-5555-4555-8555-555555555555", items: [...manual.items].reverse(),
  })).toBe(original);
  expect(manualOrderFingerprint(tableId, { ...manual, customerName: "Bima" })).not.toBe(original);
});
