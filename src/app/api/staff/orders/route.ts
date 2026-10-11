import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diningTables, orderItems, orders, tableSessions } from "@/db/schema";
import { apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

const querySchema = z.strictObject({
  status: z.enum(["PENDING", "PREPARING", "SERVED"]).default("PENDING"),
  tableId: z.uuid().optional(),
  source: z.enum(["QR", "MANUAL"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  includeVoided: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const q = parsed.data;
  const rows = await db.select({
    id: orders.id, tableId: diningTables.id, tableNumber: diningTables.tableNumber,
    sessionId: orders.sessionId, customerName: orders.customerName, source: orders.source,
    status: orders.status, itemCount: sql<number>`count(${orderItems.id})::int`,
    createdAt: orders.createdAt,
  }).from(orders)
    .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
    .innerJoin(diningTables, eq(tableSessions.tableId, diningTables.id))
    .leftJoin(orderItems, and(eq(orderItems.orderId, orders.id), isNull(orderItems.voidedAt)))
    .where(and(eq(orders.status, q.status),
      q.tableId ? eq(diningTables.id, q.tableId) : undefined,
      q.source ? eq(orders.source, q.source) : undefined,
      q.includeVoided === "false" ? isNull(orders.voidedAt) : undefined))
    .groupBy(orders.id, diningTables.id)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  return apiSuccess(rows);
}
