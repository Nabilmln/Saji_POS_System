import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, diningTables, orderItems, orders, payments, tableSessions } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { voidSchema } from "@/lib/contracts";

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { itemId } = await context.params;
  if (!z.uuid().safeParse(itemId).success) return apiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found");
  const body = await parseBody(request, voidSchema);
  if (body instanceof Response) return body;
  const [target] = await db.select({ tableId: tableSessions.tableId }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
    .where(eq(orderItems.id, itemId));
  if (!target) return apiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found");
  return db.transaction(async (tx) => {
    await tx.select({ id: diningTables.id }).from(diningTables)
      .where(eq(diningTables.id, target.tableId)).for("update");
    const [item] = await tx.select({
      orderId: orders.id, orderStatus: orders.status, orderVoidedAt: orders.voidedAt,
      sessionId: tableSessions.id, closedAt: tableSessions.closedAt,
      voidedAt: orderItems.voidedAt, servedAt: orderItems.servedAt,
    }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
      .where(eq(orderItems.id, itemId)).for("update");
    if (!item) return apiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found");
    if (item.closedAt || (await tx.select({ id: payments.id }).from(payments)
      .where(eq(payments.sessionId, item.sessionId)).limit(1)).length) {
      return apiError(409, "SESSION_NOT_ACTIVE", "Session is closed or paid");
    }
    if (item.voidedAt) return apiError(409, "ITEM_ALREADY_VOIDED", "Item is already voided");
    if (item.servedAt && (!body.reasonType || !body.reasonDetail)) {
      return apiError(422, "VOID_REASON_REQUIRED", "Served items require a cancellation reason");
    }
    const reasonType = body.reasonType ?? "CUSTOMER_REQUEST";
    const reasonDetail = body.reasonDetail ?? "Cancelled before serving";
    const now = new Date();
    await tx.update(orderItems).set({
      voidedAt: now, voidedByUserId: staff.userId,
      voidReasonType: reasonType, voidReasonDetail: reasonDetail,
    }).where(eq(orderItems.id, itemId));
    const remaining = await tx.select({ servedAt: orderItems.servedAt }).from(orderItems)
      .where(and(eq(orderItems.orderId, item.orderId), isNull(orderItems.voidedAt)));
    const orderVoided = remaining.length === 0;
    if (orderVoided) {
      await tx.update(orders).set({ voidedAt: now, updatedAt: now }).where(eq(orders.id, item.orderId));
    } else if (item.orderStatus === "PREPARING" && remaining.every((line) => line.servedAt)) {
      await tx.update(orders).set({ status: "SERVED", updatedAt: now }).where(eq(orders.id, item.orderId));
    }
    const [session] = await tx.update(tableSessions)
      .set({ billRevision: sql`${tableSessions.billRevision} + 1` })
      .where(eq(tableSessions.id, item.sessionId)).returning({ billRevision: tableSessions.billRevision });
    await tx.insert(auditEvents).values({
      actorUserId: staff.userId, actorType: "STAFF", action: "ORDER_ITEM_VOIDED",
      entityType: "ORDER_ITEM", entityId: itemId, tableId: target.tableId, sessionId: item.sessionId,
      reason: reasonDetail,
      details: { reasonType, wasServed: !!item.servedAt, orderVoided },
    });
    return apiSuccess({
      itemId, voided: true, orderVoided, billRevision: session.billRevision.toString(),
    });
  });
}
