import { z } from "zod";
import { db } from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { loadBill } from "@/lib/staff/bill";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { sessionId } = await context.params;
  if (!z.uuid().safeParse(sessionId).success) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
  return db.transaction(async (tx) => {
    const bill = await loadBill(tx, sessionId);
    if (!bill) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
    if (bill.session.closedAt) return apiError(409, "SESSION_NOT_ACTIVE", "Use the receipt for a paid session");
    return apiSuccess(bill.quote);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
