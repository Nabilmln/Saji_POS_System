import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, diningTables, reservations, tableSessions } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "RESERVATION_NOT_FOUND", "Reservation not found");
  const body = await parseBody(request, z.strictObject({}));
  if (body instanceof Response) return body;
  const [target] = await db.select({ tableId: reservations.tableId }).from(reservations)
    .where(eq(reservations.id, id));
  if (!target) return apiError(404, "RESERVATION_NOT_FOUND", "Reservation not found");
  return db.transaction(async (tx) => {
    const [table] = await tx.select().from(diningTables)
      .where(eq(diningTables.id, target.tableId)).for("update");
    const [reservation] = await tx.select().from(reservations)
      .where(eq(reservations.id, id)).for("update");
    if (!reservation) return apiError(404, "RESERVATION_NOT_FOUND", "Reservation not found");
    if (!table || !table.isActive || table.status !== "RESERVED" || reservation.status !== "RESERVED") {
      return apiError(409, "RESERVATION_NOT_ACTIVE", "Reservation cannot be checked in");
    }
    const [existing] = await tx.select({ id: tableSessions.id }).from(tableSessions)
      .where(and(eq(tableSessions.tableId, table.id), isNull(tableSessions.closedAt))).limit(1);
    if (existing) return apiError(409, "SESSION_ALREADY_ACTIVE", "Table already has an active session");
    const [session] = await tx.insert(tableSessions).values({
      tableId: table.id, openedByUserId: staff.userId,
    }).returning({ id: tableSessions.id });
    await tx.update(reservations).set({ status: "CHECKED_IN", updatedAt: new Date() })
      .where(eq(reservations.id, id));
    await tx.update(diningTables).set({ status: "OCCUPIED", updatedAt: new Date() })
      .where(eq(diningTables.id, table.id));
    await tx.insert(auditEvents).values({
      actorUserId: staff.userId, actorType: "STAFF", action: "RESERVATION_CHECKED_IN",
      entityType: "RESERVATION", entityId: id, tableId: table.id, sessionId: session.id,
    });
    return apiSuccess({
      reservationId: id, status: "CHECKED_IN", sessionId: session.id, tableStatus: "OCCUPIED",
    });
  });
}
