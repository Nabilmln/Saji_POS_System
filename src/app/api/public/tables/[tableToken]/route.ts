import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { diningTables } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_request: Request, context: { params: Promise<{ tableToken: string }> }) {
  const { tableToken } = await context.params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(tableToken)) {
    return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
  }
  const [table] = await db.select({
    tableId: diningTables.id, tableNumber: diningTables.tableNumber,
    status: diningTables.status, cycleNumber: diningTables.cycleNumber,
  }).from(diningTables).where(and(eq(diningTables.qrToken, tableToken), eq(diningTables.isActive, true)));
  return table ? apiSuccess({ ...table, requiresName: true })
    : apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
}
