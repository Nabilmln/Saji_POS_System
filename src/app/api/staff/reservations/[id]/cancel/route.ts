import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, diningTables, reservations } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

const cancelSchema = z.strictObject({ reason: z.string().trim().min(5).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "RESERVATION_NOT_FOUND", "Reservation not found");
  const body = await parseBody(request, cancelSchema);
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
    if (!table || table.status !== "RESERVED" || reservation.status !== "RESERVED") {
      return apiError(409, "RESERVATION_NOT_ACTIVE", "Reservation cannot be cancelled");
    }
    await tx.update(reservations).set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(reservations.id, id));
    await tx.update(diningTables).set({ status: "AVAILABLE", updatedAt: new Date() })
      .where(eq(diningTables.id, table.id));
    await tx.insert(auditEvents).values({
      actorUserId: staff.userId, actorType: "STAFF", action: "RESERVATION_CANCELLED",
      entityType: "RESERVATION", entityId: id, tableId: table.id, reason: body.reason,
    });
    return apiSuccess({ reservationId: id, status: "CANCELLED", tableStatus: "AVAILABLE" });
  });
}
