import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, orderItems, orders, storeSettings, tableSessions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { calculateBill } from "@/lib/billing";

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();
  if (status && !["AVAILABLE", "OCCUPIED", "RESERVED"].includes(status)) {
    return apiError(422, "VALIDATION_ERROR", "Invalid table status");
  }
  if (q && q.length > 30) return apiError(422, "VALIDATION_ERROR", "Search is too long");
  const rows = await db.select({
    id: diningTables.id, tableNumber: diningTables.tableNumber, status: diningTables.status,
    sessionId: tableSessions.id, billRevision: tableSessions.billRevision,
    activeOrderCount: sql<number>`count(DISTINCT ${orders.id})::int`,
    pendingOrderCount: sql<number>`count(DISTINCT ${orders.id}) FILTER (WHERE ${orders.status} = 'PENDING')::int`,
    subtotal: sql<string>`coalesce(sum(${orderItems.lineTotalIdr}), 0)::text`,
  }).from(diningTables)
    .leftJoin(tableSessions, and(eq(tableSessions.tableId, diningTables.id), isNull(tableSessions.closedAt)))
    .leftJoin(orders, and(eq(orders.sessionId, tableSessions.id), isNull(orders.voidedAt)))
    .leftJoin(orderItems, and(eq(orderItems.orderId, orders.id), isNull(orderItems.voidedAt)))
    .where(and(eq(diningTables.isActive, true),
      status ? eq(diningTables.status, status) : undefined,
      q ? ilike(diningTables.tableNumber, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined))
    .groupBy(diningTables.id, tableSessions.id)
    .orderBy(asc(diningTables.tableNumber));
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (!settings) return apiError(503, "SETTINGS_UNAVAILABLE", "Billing settings unavailable");
  return apiSuccess(rows.map((row) => ({
    id: row.id, tableNumber: row.tableNumber, status: row.status, sessionId: row.sessionId,
    activeOrderCount: row.activeOrderCount, pendingOrderCount: row.pendingOrderCount,
    grandTotalIdr: row.sessionId ? calculateBill(BigInt(row.subtotal), {
      ...settings, discountAmountIdr: settings.discountAmountIdr ?? 0n,
    }).grandTotalIdr : "0",
    billRevision: row.billRevision?.toString() ?? null,
  })));
}
