import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { menuItems, orderItems, orders, payments, tableSessions } from "@/db/schema";
import { apiSuccess, apiValidationError } from "@/lib/api-response";
import { reportBounds, reportRangeSchema } from "@/lib/admin/report-range";
import { requireAdmin } from "@/lib/auth/guards";

const querySchema = reportRangeSchema.safeExtend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { start, end } = reportBounds(parsed.data.from, parsed.data.to);
  const rows = await db.select({
    menuName: orderItems.menuNameSnapshot,
    imageUrl: sql<string | null>`max(${menuItems.imageUrl})`,
    quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
    grossSalesIdr: sql<string>`sum(${orderItems.unitPriceIdr} * ${orderItems.quantity})::text`,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(tableSessions, eq(orders.sessionId, tableSessions.id))
    .innerJoin(payments, eq(payments.sessionId, tableSessions.id))
    .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(and(gte(payments.paidAt, start), lt(payments.paidAt, end),
      isNull(orderItems.voidedAt)))
    .groupBy(orderItems.menuNameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.quantity})`), desc(sql`sum(${orderItems.unitPriceIdr} * ${orderItems.quantity})`), asc(orderItems.menuNameSnapshot))
    .limit(parsed.data.limit);
  return apiSuccess(rows);
}
