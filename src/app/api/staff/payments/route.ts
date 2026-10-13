import { and, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { db } from "@/db";
import { diningTables, payments, tableSessions } from "@/db/schema";
import { apiPage, apiError, apiValidationError } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

const querySchema = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE).default(LIST_PAGE_SIZE),
});

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { from, to, page, pageSize } = parsed.data;
  if (from && to && (from > to || Date.parse(to) - Date.parse(from) > 366 * 86_400_000)) {
    return apiError(422, "VALIDATION_ERROR", "Date range must be at most 366 days");
  }
  const fromDate = from ? new Date(`${from}T00:00:00+07:00`) : undefined;
  const toDate = to ? new Date(Date.parse(`${to}T00:00:00+07:00`) + 86_400_000) : undefined;
  const rows = await db.select({
    id: payments.id, sessionId: payments.sessionId, tableId: diningTables.id,
    tableNumber: diningTables.tableNumber, method: payments.method,
    grandTotalIdr: payments.grandTotalIdr, cashReceivedIdr: payments.cashReceivedIdr,
    changeIdr: payments.changeIdr, paidAt: payments.paidAt,
  }).from(payments).innerJoin(tableSessions, eq(payments.sessionId, tableSessions.id))
    .innerJoin(diningTables, eq(tableSessions.tableId, diningTables.id))
    .where(and(fromDate ? gte(payments.paidAt, fromDate) : undefined,
      toDate ? lt(payments.paidAt, toDate) : undefined))
    .orderBy(desc(payments.paidAt), desc(payments.id))
    .limit(pageSize + 1).offset((page - 1) * pageSize);
  return apiPage(rows.map((row) => ({
    ...row, grandTotalIdr: row.grandTotalIdr.toString(),
    cashReceivedIdr: row.cashReceivedIdr.toString(), changeIdr: row.changeIdr.toString(),
  })), page, pageSize);
}
