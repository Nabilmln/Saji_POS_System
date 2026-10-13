import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diningTables, orderItems, orders, tableSessions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireOrderView } from "@/lib/public/tokens";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const view = requireOrderView(request);
  if (view instanceof Response) return view;
  const { orderId } = await context.params;
  if (!z.uuid().safeParse(orderId).success || view.orderId !== orderId) {
    return apiError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  const [order] = await db.select({
    orderId: orders.id, tableNumber: diningTables.tableNumber,
    customerName: orders.customerName, status: orders.status,
    voidedAt: orders.voidedAt, updatedAt: orders.updatedAt,
    closedAt: tableSessions.closedAt, closureReason: tableSessions.closureReason,
  }).from(orders)
    .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
    .innerJoin(diningTables, eq(tableSessions.tableId, diningTables.id))
    .where(and(eq(orders.id, orderId), eq(diningTables.id, view.tableId)));
  if (!order) return apiError(404, "ORDER_NOT_FOUND", "Order not found");
  const items = await db.select({
    menuName: orderItems.menuNameSnapshot, quantity: orderItems.quantity,
    servedAt: orderItems.servedAt, voidedAt: orderItems.voidedAt,
  }).from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
  return apiSuccess({
    orderId: order.orderId, tableNumber: order.tableNumber,
    customerName: order.customerName, status: order.status,
    voided: order.voidedAt !== null, updatedAt: order.updatedAt,
    session: { status: !order.closedAt ? "OPEN" : order.closureReason === "PAID" ? "PAID" : "CLOSED", closedAt: order.closedAt },
    items: items.map((item) => ({
      menuName: item.menuName, quantity: item.quantity,
      served: item.servedAt !== null, voided: item.voidedAt !== null,
    })),
  });
}
