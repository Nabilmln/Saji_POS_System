import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, diningTables, reservations, tableSessions } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

const querySchema = z.strictObject({
  status: z.enum(["RESERVED", "CHECKED_IN", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const createSchema = z.strictObject({
  tableId: z.uuid(),
  customerName: z.string().trim().min(1).max(120),
  customerContact: z.string().trim().min(1).max(80),
  guestCount: z.number().int().min(1).max(100),
  reservedFor: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { status, page, pageSize } = parsed.data;
  const rows = await db.select({
    id: reservations.id, tableId: reservations.tableId, tableNumber: diningTables.tableNumber,
    customerName: reservations.customerName, customerContact: reservations.customerContact,
    guestCount: reservations.guestCount, reservedFor: reservations.reservedFor,
    notes: reservations.notes, status: reservations.status,
    createdAt: reservations.createdAt, updatedAt: reservations.updatedAt,
  }).from(reservations).innerJoin(diningTables, eq(reservations.tableId, diningTables.id))
    .where(status ? eq(reservations.status, status) : undefined)
    .orderBy(desc(reservations.createdAt), desc(reservations.id))
    .limit(pageSize).offset((page - 1) * pageSize);
  return apiSuccess(rows);
}

export async function POST(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const body = await parseBody(request, createSchema);
  if (body instanceof Response) return body;
  try {
    return await db.transaction(async (tx) => {
      const [table] = await tx.select({
        id: diningTables.id, tableNumber: diningTables.tableNumber,
        status: diningTables.status, isActive: diningTables.isActive,
      }).from(diningTables).where(eq(diningTables.id, body.tableId)).for("update");
      if (!table) return apiError(404, "TABLE_NOT_FOUND", "Table not found");
      if (!table.isActive || table.status !== "AVAILABLE") {
        return apiError(409, "TABLE_NOT_AVAILABLE", "Table is unavailable for reservation");
      }
      const [session] = await tx.select({ id: tableSessions.id }).from(tableSessions)
        .where(and(eq(tableSessions.tableId, table.id), isNull(tableSessions.closedAt))).limit(1);
      if (session) return apiError(409, "TABLE_NOT_AVAILABLE", "Table has an active session");
      const [reservation] = await tx.insert(reservations).values({
        tableId: table.id, customerName: body.customerName,
        customerContact: body.customerContact, guestCount: body.guestCount,
        reservedFor: new Date(body.reservedFor), notes: body.notes || null,
        createdByUserId: staff.userId,
      }).returning();
      await tx.update(diningTables).set({ status: "RESERVED", updatedAt: new Date() })
        .where(eq(diningTables.id, table.id));
      await tx.insert(auditEvents).values({
        actorUserId: staff.userId, actorType: "STAFF", action: "RESERVATION_CREATED",
        entityType: "RESERVATION", entityId: reservation.id, tableId: table.id,
      });
      return apiSuccess({ ...reservation, tableNumber: table.tableNumber }, 201);
    });
  } catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if (pg.code === "23505" || pg.cause?.code === "23505") {
      return apiError(409, "TABLE_NOT_AVAILABLE", "Table already has a reservation");
    }
    throw error;
  }
}
