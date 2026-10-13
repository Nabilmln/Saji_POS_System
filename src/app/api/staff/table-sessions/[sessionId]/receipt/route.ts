import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { loadBill } from "@/lib/staff/bill";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { sessionId } = await context.params;
  if (!z.uuid().safeParse(sessionId).success) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
  return db.transaction(async (tx) => {
    const [payment] = await tx.select({ receipt: payments.receiptSnapshot }).from(payments)
      .where(eq(payments.sessionId, sessionId));
    if (payment) return apiSuccess(payment.receipt);
    const bill = await loadBill(tx, sessionId);
    if (!bill) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
    if (bill.session.closedAt) return apiError(409, "SESSION_NOT_ACTIVE", "Session closed without a payment receipt");
    return apiSuccess({
      status: "UNPAID", paymentId: null, paidAt: null,
      sessionId, storeName: bill.settings.storeName, tableNumber: bill.session.tableNumber,
      orders: bill.receiptOrders, subtotalIdr: bill.quote.subtotalIdr,
      discountIdr: bill.quote.discount.appliedAmountIdr,
      tax: { rateBps: bill.quote.tax.rateBps, amountIdr: bill.quote.tax.amountIdr },
      grandTotalIdr: bill.quote.grandTotalIdr, cashReceivedIdr: null, changeIdr: null,
      calculatedAt: bill.quote.calculatedAt,
      sessionRevision: bill.quote.sessionRevision, settingsVersion: bill.quote.settingsVersion,
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
