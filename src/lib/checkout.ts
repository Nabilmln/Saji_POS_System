import { createHash } from "node:crypto";
import type { z } from "zod";
import type { checkoutSchema, manualOrderSchema } from "./contracts";

type Checkout = z.output<typeof checkoutSchema>;

export function checkoutFingerprint(tableId: string, customerName: string, checkout: Checkout) {
  const items = checkout.items.map((item) => ({
    menuItemId: item.menuItemId.toLowerCase(), quantity: item.quantity, note: item.note ?? "",
  })).sort((a, b) => a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0);
  return createHash("sha256").update(JSON.stringify({
    source: "QR", tableId: tableId.toLowerCase(), cycleNumber: checkout.expectedCycleNumber,
    customerName, note: checkout.note ?? "", items,
  })).digest("hex");
}

export function manualOrderFingerprint(tableId: string, order: z.output<typeof manualOrderSchema>) {
  const items = order.items.map((item) => ({
    menuItemId: item.menuItemId.toLowerCase(), quantity: item.quantity, note: item.note ?? "",
  })).sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
  return createHash("sha256").update(JSON.stringify({
    source: "MANUAL", tableId: tableId.toLowerCase(), customerName: order.customerName,
    note: order.note ?? "", items,
  })).digest("hex");
}
