import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, diningTables, reservations, tableSessions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { databaseConflict, parseBody, parseId, tableData, tablePatchSchema } from "@/lib/admin/master-data";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  const body = await parseBody(request, tablePatchSchema);
  if (body instanceof Response) return body;
  try {
    const result = await db.transaction(async (tx) => {
      const [table] = await tx.select().from(diningTables).where(eq(diningTables.id, id)).for("update");
      if (!table || table.deletedAt) return "missing";
      const [session] = await tx.select({ id: tableSessions.id }).from(tableSessions)
        .where(and(eq(tableSessions.tableId, id), isNull(tableSessions.closedAt))).limit(1);
      if (table.status !== "AVAILABLE" || session) return "busy";
      const [updated] = await tx.update(diningTables).set({ ...body, updatedAt: new Date() })
        .where(eq(diningTables.id, id)).returning();
      return updated;
    });
    if (result === "missing") return apiError(404, "TABLE_NOT_FOUND", "Table not found");
    if (result === "busy") return apiError(409, "TABLE_NOT_AVAILABLE", "Table is occupied or reserved");
    return apiSuccess(tableData(result));
  } catch (error) {
    return databaseConflict(error, "TABLE_EXISTS", "Table number already exists");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  return db.transaction(async (tx) => {
    const [table] = await tx.select().from(diningTables).where(eq(diningTables.id, id)).for("update");
    if (!table || table.deletedAt) return apiError(404, "TABLE_NOT_FOUND", "Table not found");
    const [session] = await tx.select({ id: tableSessions.id }).from(tableSessions)
      .where(and(eq(tableSessions.tableId, id), isNull(tableSessions.closedAt))).limit(1);
    const [reservation] = await tx.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.tableId, id), eq(reservations.status, "RESERVED"))).limit(1);
    if (table.status !== "AVAILABLE" || session || reservation) return apiError(409, "TABLE_NOT_AVAILABLE", "Table is occupied or reserved");
    const deletedAt = new Date();
    await tx.update(diningTables).set({ deletedAt, isActive: false, updatedAt: deletedAt }).where(eq(diningTables.id, id));
    await tx.insert(auditEvents).values({
      actorUserId: admin.userId, actorType: "STAFF", action: "TABLE_DELETED",
      entityType: "TABLE", entityId: id, tableId: id, details: { tableNumber: table.tableNumber },
    });
    return apiSuccess({ id, deletedAt });
  });
}
