import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diningTables } from "@/db/schema";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api-response";
import { issueGuestToken } from "@/lib/public/tokens";

const schema = z.strictObject({
  customerName: z.string().trim().min(1).max(120),
  expectedCycleNumber: z.number().int().min(0).max(2_147_483_647),
});

export async function POST(request: Request, context: { params: Promise<{ tableToken: string }> }) {
  const { tableToken } = await context.params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(tableToken)) {
    return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
  }
  let input: unknown;
  try { input = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Expected a JSON request body"); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return apiValidationError(parsed.error);
  const [table] = await db.select({
    id: diningTables.id, tableNumber: diningTables.tableNumber,
    cycleNumber: diningTables.cycleNumber,
  }).from(diningTables).where(and(eq(diningTables.qrToken, tableToken), eq(diningTables.isActive, true)));
  if (!table) return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
  if (table.cycleNumber !== parsed.data.expectedCycleNumber) {
    return apiError(409, "TABLE_CYCLE_CHANGED", "Refresh the table and enter your name again");
  }
  return apiSuccess({
    customerName: parsed.data.customerName, tableNumber: table.tableNumber,
    cycleNumber: table.cycleNumber,
    ...issueGuestToken(table.id, table.cycleNumber, parsed.data.customerName),
  });
}
