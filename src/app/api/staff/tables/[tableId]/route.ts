import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diningTables, orderItems, orders, storeSettings, tableSessions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { calculateBill } from "@/lib/billing";

export async function GET(request: Request, context: { params: Promise<{ tableId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { tableId } = await context.params;
  if (!z.uuid().safeParse(tableId).success) return apiError(404, "TABLE_NOT_FOUND", "Table not found");
  const [table] = await db.select({
    id: diningTables.id, tableNumber: diningTables.tableNumber, status: diningTables.status,
    isActive: diningTables.isActive, cycleNumber: diningTables.cycleNumber,
  }).from(diningTables).where(eq(diningTables.id, tableId));
  if (!table) return apiError(404, "TABLE_NOT_FOUND", "Table not found");
  const [session] = await db.select().from(tableSessions)
    .where(and(eq(tableSessions.tableId, tableId), isNull(tableSessions.closedAt)));
  if (!session) return apiSuccess({ ...table, session: null, orders: [], bill: null });
  const orderRows = await db.select().from(orders).where(eq(orders.sessionId, session.id))
    .orderBy(asc(orders.createdAt), asc(orders.id));
  const items = await db.select({
    id: orderItems.id, orderId: orderItems.orderId, menuItemId: orderItems.menuItemId,
    menuName: orderItems.menuNameSnapshot, quantity: orderItems.quantity,
    unitPriceIdr: orderItems.unitPriceIdr, lineTotalIdr: orderItems.lineTotalIdr,
    customerNote: orderItems.customerNote, servedAt: orderItems.servedAt, voidedAt: orderItems.voidedAt,
  }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orders.sessionId, session.id)).orderBy(asc(orderItems.id));
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (!settings) return apiError(503, "SETTINGS_UNAVAILABLE", "Billing settings unavailable");
  const subtotal = items.reduce((sum, item) =>
    sum + (item.voidedAt ? 0n : item.unitPriceIdr * BigInt(item.quantity)), 0n);
  return apiSuccess({
    ...table,
    session: { id: session.id, openedAt: session.openedAt, billRevision: session.billRevision.toString() },
    orders: orderRows.map((order) => ({
      id: order.id, customerName: order.customerName, source: order.source, status: order.status,
      note: order.note, createdAt: order.createdAt, acceptedAt: order.acceptedAt, voidedAt: order.voidedAt,
      items: items.filter((item) => item.orderId === order.id).map((item) => ({
        ...item, unitPriceIdr: item.unitPriceIdr.toString(),
        lineTotalIdr: (item.unitPriceIdr * BigInt(item.quantity)).toString(),
        served: item.servedAt !== null, voided: item.voidedAt !== null,
      })),
    })),
    bill: { ...calculateBill(subtotal, {
      ...settings, discountAmountIdr: settings.discountAmountIdr ?? 0n,
    }), sessionRevision: session.billRevision.toString(), settingsVersion: settings.version.toString() },
  });
}
