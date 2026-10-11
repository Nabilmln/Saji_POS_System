import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "PAYMENT_NOT_FOUND", "Payment not found");
  const [payment] = await db.select({ receiptSnapshot: payments.receiptSnapshot }).from(payments)
    .where(eq(payments.id, id));
  return payment ? apiSuccess(payment.receiptSnapshot)
    : apiError(404, "PAYMENT_NOT_FOUND", "Payment not found");
}
