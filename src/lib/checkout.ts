import { createHash } from "node:crypto";
import type { z } from "zod";
import type { checkoutSchema, manualOrderSchema } from "./contracts";

type Checkout = z.output<typeof checkoutSchema>;

type OrderItemInput = { menuItemId: string; quantity: number; note?: string | null };

function hashOrderPayload(payload: {
  source: "QR" | "MANUAL";
  tableId: string;
  cycleNumber?: number;
  customerName: string;
  note?: string | null;
  items: OrderItemInput[];
}) {
  const items = payload.items.map((item) => ({
    menuItemId: item.menuItemId.toLowerCase(), quantity: item.quantity, note: item.note ?? "",
  })).sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
  return createHash("sha256").update(JSON.stringify({
    source: payload.source,
    tableId: payload.tableId.toLowerCase(),
    ...(payload.cycleNumber !== undefined ? { cycleNumber: payload.cycleNumber } : {}),
    customerName: payload.customerName,
    note: payload.note ?? "",
    items,
  })).digest("hex");
}

export function checkoutFingerprint(tableId: string, customerName: string, checkout: Checkout) {
  return hashOrderPayload({
    source: "QR", tableId, cycleNumber: checkout.expectedCycleNumber,
    customerName, note: checkout.note, items: checkout.items,
  });
}

export function manualOrderFingerprint(tableId: string, order: z.output<typeof manualOrderSchema>) {
  return hashOrderPayload({
    source: "MANUAL", tableId, customerName: order.customerName ?? "",
    note: order.note, items: order.items,
  });
}
