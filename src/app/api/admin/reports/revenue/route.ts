import { and, asc, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { apiSuccess, apiValidationError } from "@/lib/api-response";
import { reportBounds, reportRangeSchema } from "@/lib/admin/report-range";
import { requireAdmin } from "@/lib/auth/guards";
import { RESTAURANT_TIME_ZONE } from "@/lib/time";

const querySchema = reportRangeSchema.safeExtend({ groupBy: z.literal("day") });

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { start, end } = reportBounds(parsed.data.from, parsed.data.to);
  const day = sql<string>`to_char(${payments.paidAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
  const rows = await db.select({
    date: day,
    revenueIdr: sql<string>`sum(${payments.grandTotalIdr})::text`,
    transactionCount: sql<number>`count(*)::int`,
  }).from(payments)
    .where(and(gte(payments.paidAt, start), lt(payments.paidAt, end)))
    .groupBy(day).orderBy(asc(day));
  return apiSuccess({
    currency: "IDR", timezone: RESTAURANT_TIME_ZONE,
    summary: {
      revenueIdr: rows.reduce((sum, row) => sum + BigInt(row.revenueIdr), 0n).toString(),
      paidTransactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0),
    },
    points: rows,
  });
}
