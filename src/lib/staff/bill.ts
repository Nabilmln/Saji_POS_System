import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, orderItems, orders, storeSettings, tableSessions } from "@/db/schema";
import { calculateBill } from "@/lib/billing";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Settings = typeof storeSettings.$inferSelect;

export async function loadBill(tx: Transaction, sessionId: string, lockedSettings?: Settings) {
  const [session] = await tx.select({
    id: tableSessions.id, tableId: tableSessions.tableId, tableNumber: diningTables.tableNumber,
    tableStatus: diningTables.status, closedAt: tableSessions.closedAt,
    billRevision: tableSessions.billRevision,
  }).from(tableSessions).innerJoin(diningTables, eq(tableSessions.tableId, diningTables.id))
    .where(eq(tableSessions.id, sessionId));
  if (!session) return null;
  const settings = lockedSettings ?? (await tx.select().from(storeSettings).where(eq(storeSettings.id, 1)))[0];
  if (!settings) throw new Error("Billing settings missing");
  const orderRows = await tx.select({
    id: orders.id, customerName: orders.customerName, status: orders.status,
    voidedAt: orders.voidedAt,
  }).from(orders).where(eq(orders.sessionId, sessionId))
    .orderBy(asc(orders.createdAt), asc(orders.id));
  const itemRows = await tx.select({
    orderId: orders.id, id: orderItems.id, menuName: orderItems.menuNameSnapshot,
    quantity: orderItems.quantity, unitPriceIdr: orderItems.unitPriceIdr,
    servedAt: orderItems.servedAt, voidedAt: orderItems.voidedAt,
  }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orders.sessionId, sessionId)).orderBy(asc(orderItems.id));
  const activeItems = itemRows.filter((item) => !item.voidedAt);
  const subtotal = activeItems.reduce((sum, item) => sum + item.unitPriceIdr * BigInt(item.quantity), 0n);
  const totals = calculateBill(subtotal, { ...settings, discountAmountIdr: settings.discountAmountIdr ?? 0n });
  const blockingOrders = orderRows.flatMap((order) => {
    const items = activeItems.filter((item) => item.orderId === order.id);
    if (!items.length || (!order.voidedAt && order.status === "SERVED" &&
        items.every((item) => item.servedAt))) {
      return [];
    }
    return [{ orderId: order.id, status: order.status,
      unservedItemCount: items.filter((item) => !item.servedAt).length }];
  });
  const receiptOrders = orderRows.flatMap((order) => {
    const items = activeItems.filter((item) => item.orderId === order.id);
    return items.length ? [{
      customerName: order.customerName,
      items: items.map((item) => ({
        menuName: item.menuName, quantity: item.quantity,
        unitPriceIdr: item.unitPriceIdr.toString(),
        lineTotalIdr: (item.unitPriceIdr * BigInt(item.quantity)).toString(),
      })),
    }] : [];
  });
  return {
    session, settings, activeItemCount: activeItems.length, receiptOrders,
    quote: {
      sessionId, tableId: session.tableId, tableNumber: session.tableNumber,
      sessionRevision: session.billRevision.toString(), settingsVersion: settings.version.toString(),
      currency: "IDR", subtotalIdr: totals.subtotalIdr,
      discount: { enabled: settings.discountEnabled,
        configuredAmountIdr: (settings.discountAmountIdr ?? 0n).toString(),
        appliedAmountIdr: totals.discountIdr },
      tax: { enabled: settings.taxEnabled, rateBps: settings.taxRateBps, amountIdr: totals.taxIdr },
      grandTotalIdr: totals.grandTotalIdr,
      paymentEligible: !session.closedAt && session.tableStatus === "OCCUPIED" &&
        activeItems.length > 0 && blockingOrders.length === 0,
      blockingOrders, calculatedAt: new Date(),
    },
  };
}
