import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diningTables, orderItems, orders, payments, tableSessions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { itemId } = await context.params;
  if (!z.uuid().safeParse(itemId).success) return apiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found");
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Expected a JSON request body"); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || (body as { served?: unknown }).served !== true) {
    return apiError(422, "VALIDATION_ERROR", "Only served: true is supported");
  }
  const [target] = await db.select({ tableId: tableSessions.tableId }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
    .where(eq(orderItems.id, itemId));
  if (!target) return apiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found");
  return db.transaction(async (tx) => {
    await tx.select({ id: diningTables.id }).from(diningTables)
      .where(eq(diningTables.id, target.tableId)).for("update");
    const [item] = await tx.select({
      orderId: orders.id, status: orders.status, orderVoidedAt: orders.voidedAt,
      servedAt: orderItems.servedAt, voidedAt: orderItems.voidedAt,
      sessionId: tableSessions.id, closedAt: tableSessions.closedAt,
    }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
      .where(eq(orderItems.id, itemId)).for("update");
    if (!item) return apiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found");
    if (item.closedAt || item.orderVoidedAt || item.voidedAt ||
        item.servedAt || !["PREPARING", "SERVED"].includes(item.status)) {
      return apiError(409, "INVALID_ORDER_TRANSITION", "Order item cannot be marked served");
    }
    const [payment] = await tx.select({ id: payments.id }).from(payments)
      .where(eq(payments.sessionId, item.sessionId)).limit(1);
    if (payment) return apiError(409, "SESSION_PAID", "Paid orders cannot be changed");
    const [updated] = await tx.update(orderItems).set({
      servedAt: new Date(), servedByUserId: staff.userId,
    }).where(eq(orderItems.id, itemId)).returning({ servedAt: orderItems.servedAt });
    const [unserved] = await tx.select({ id: orderItems.id }).from(orderItems)
      .where(and(eq(orderItems.orderId, item.orderId), isNull(orderItems.voidedAt),
        isNull(orderItems.servedAt))).limit(1);
    const orderStatus = unserved ? "PREPARING" : "SERVED";
    if (!unserved) await tx.update(orders).set({ status: "SERVED", updatedAt: new Date() })
      .where(eq(orders.id, item.orderId));
    const [session] = await tx.update(tableSessions)
      .set({ billRevision: sql`${tableSessions.billRevision} + 1` })
      .where(eq(tableSessions.id, item.sessionId)).returning({ billRevision: tableSessions.billRevision });
    return apiSuccess({
      itemId, served: true, servedAt: updated.servedAt, orderId: item.orderId,
      orderStatus, billRevision: session.billRevision.toString(),
    });
  });
}
