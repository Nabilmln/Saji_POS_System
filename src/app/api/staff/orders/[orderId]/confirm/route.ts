import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diningTables, orderItems, orders, tableSessions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { orderId } = await context.params;
  if (!z.uuid().safeParse(orderId).success) return apiError(404, "ORDER_NOT_FOUND", "Order not found");
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Expected a JSON request body"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
    return apiError(422, "VALIDATION_ERROR", "Expected an empty JSON object");
  }
  const [target] = await db.select({ tableId: tableSessions.tableId }).from(orders)
    .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
    .where(eq(orders.id, orderId));
  if (!target) return apiError(404, "ORDER_NOT_FOUND", "Order not found");
  return db.transaction(async (tx) => {
    await tx.select({ id: diningTables.id }).from(diningTables)
      .where(eq(diningTables.id, target.tableId)).for("update");
    const [order] = await tx.select({
      id: orders.id, status: orders.status, voidedAt: orders.voidedAt,
      sessionId: orders.sessionId, closedAt: tableSessions.closedAt,
    }).from(orders).innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
      .where(eq(orders.id, orderId)).for("update");
    if (!order) return apiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.closedAt || order.voidedAt || order.status !== "PENDING") {
      return apiError(409, "INVALID_ORDER_TRANSITION", "Order cannot be confirmed");
    }
    const [active] = await tx.select({ id: orderItems.id }).from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.voidedAt))).limit(1);
    if (!active) return apiError(409, "INVALID_ORDER_TRANSITION", "Order has no active items");
    const [updated] = await tx.update(orders).set({
      status: "PREPARING", acceptedAt: new Date(), acceptedByUserId: staff.userId, updatedAt: new Date(),
    }).where(eq(orders.id, orderId)).returning({ acceptedAt: orders.acceptedAt });
    return apiSuccess({ orderId, status: "PREPARING", acceptedAt: updated.acceptedAt });
  });
}
