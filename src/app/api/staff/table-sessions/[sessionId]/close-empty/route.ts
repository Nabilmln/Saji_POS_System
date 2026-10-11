import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, diningTables, orders, payments, tableSessions } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { revisionSchema } from "@/lib/contracts";

const closeSchema = z.strictObject({
  expectedSessionRevision: revisionSchema,
  reason: z.string().trim().min(5).max(500),
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { sessionId } = await context.params;
  if (!z.uuid().safeParse(sessionId).success) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
  const body = await parseBody(request, closeSchema);
  if (body instanceof Response) return body;
  const [target] = await db.select({ tableId: tableSessions.tableId }).from(tableSessions)
    .where(eq(tableSessions.id, sessionId));
  if (!target) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
  return db.transaction(async (tx) => {
    const [table] = await tx.select().from(diningTables)
      .where(eq(diningTables.id, target.tableId)).for("update");
    const [session] = await tx.select().from(tableSessions)
      .where(eq(tableSessions.id, sessionId)).for("update");
    if (!table || !session || session.closedAt || table.status !== "OCCUPIED") {
      return apiError(409, "SESSION_NOT_ACTIVE", "Session is no longer active");
    }
    if (session.billRevision !== BigInt(body.expectedSessionRevision)) {
      return apiError(409, "BILL_CHANGED", "Refetch the session before closing");
    }
    if ((await tx.select({ id: orders.id }).from(orders)
      .where(eq(orders.sessionId, sessionId)).limit(1)).length) {
      return apiError(409, "SESSION_NOT_EMPTY", "Session has orders; use payment or ALL_VOID");
    }
    if ((await tx.select({ id: payments.id }).from(payments)
      .where(eq(payments.sessionId, sessionId)).limit(1)).length) {
      return apiError(409, "SESSION_NOT_EMPTY", "Session has a payment");
    }
    const now = new Date();
    await tx.update(tableSessions).set({
      closedAt: now, closureReason: "EMPTY", closedByUserId: staff.userId,
    }).where(eq(tableSessions.id, sessionId));
    await tx.update(diningTables).set({
      status: "AVAILABLE", cycleNumber: sql`${diningTables.cycleNumber} + 1`, updatedAt: now,
    }).where(eq(diningTables.id, table.id));
    await tx.insert(auditEvents).values({
      actorUserId: staff.userId, actorType: "STAFF", action: "SESSION_CLOSED_EMPTY",
      entityType: "TABLE_SESSION", entityId: sessionId, tableId: table.id,
      sessionId, reason: body.reason,
    });
    return apiSuccess({
      sessionId, closureReason: "EMPTY", tableStatus: "AVAILABLE", paymentCreated: false,
    });
  });
}
