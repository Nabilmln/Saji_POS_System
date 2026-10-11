import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, diningTables, payments, storeSettings, tableSessions } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";
import { paymentSchema } from "@/lib/contracts";
import { loadBill } from "@/lib/staff/bill";

function paymentData(payment: typeof payments.$inferSelect) {
  return {
    paymentId: payment.id, sessionId: payment.sessionId, paymentStatus: "PAID", method: "CASH",
    subtotalIdr: payment.subtotalIdr.toString(),
    discountIdr: payment.discountAppliedIdr.toString(),
    taxIdr: payment.taxAmountIdr.toString(),
    grandTotalIdr: payment.grandTotalIdr.toString(),
    cashReceivedIdr: payment.cashReceivedIdr.toString(),
    changeIdr: payment.changeIdr.toString(),
    sessionClosed: true, tableStatus: "AVAILABLE",
    receiptUrl: `/pos/transactions/${payment.id}`, paidAt: payment.paidAt,
  };
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { sessionId } = await context.params;
  if (!z.uuid().safeParse(sessionId).success) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
  const body = await parseBody(request, paymentSchema);
  if (body instanceof Response) return body;
  const key = request.headers.get("idempotency-key");
  if (!key || !z.uuid().safeParse(key).success || key.toLowerCase() !== body.idempotencyKey.toLowerCase()) {
    return apiError(422, "VALIDATION_ERROR", "Idempotency-Key must match idempotencyKey");
  }
  const [target] = await db.select({ tableId: tableSessions.tableId }).from(tableSessions)
    .where(eq(tableSessions.id, sessionId));
  if (!target) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
  try {
    return await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1)).for("share");
      if (!settings) return apiError(503, "SETTINGS_UNAVAILABLE", "Billing settings unavailable");
      const [table] = await tx.select().from(diningTables)
        .where(eq(diningTables.id, target.tableId)).for("update");
      const [session] = await tx.select().from(tableSessions)
        .where(eq(tableSessions.id, sessionId)).for("update");
      if (!table || !session) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
      const [sameKey] = await tx.select().from(payments)
        .where(eq(payments.idempotencyKey, body.idempotencyKey));
      if (sameKey) {
        if (sameKey.sessionId !== sessionId ||
            sameKey.sessionRevision !== BigInt(body.expectedSessionRevision) ||
            sameKey.settingsVersion !== BigInt(body.expectedSettingsVersion) ||
            sameKey.cashReceivedIdr !== BigInt(body.cashReceivedIdr)) {
          return apiError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new key for a different payment");
        }
        return apiSuccess(paymentData(sameKey));
      }
      const [existing] = await tx.select({ id: payments.id }).from(payments)
        .where(eq(payments.sessionId, sessionId));
      if (existing) return apiError(409, "PAYMENT_ALREADY_RECORDED", "Session has already been paid");
      if (session.closedAt || table.status !== "OCCUPIED") {
        return apiError(409, "SESSION_NOT_ACTIVE", "Session is no longer active");
      }
      if (session.billRevision !== BigInt(body.expectedSessionRevision) ||
          settings.version !== BigInt(body.expectedSettingsVersion)) {
        return apiError(409, "BILL_CHANGED", "Refetch the bill and review the amount");
      }
      const bill = await loadBill(tx, sessionId, settings);
      if (!bill) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
      if (!bill.activeItemCount) return apiError(409, "SESSION_EMPTY", "Session has no active items");
      if (bill.quote.blockingOrders.length) {
        return apiError(409, "ORDERS_NOT_SERVED", "All active orders must be served before payment");
      }
      if (BigInt(bill.quote.subtotalIdr) > 9_000_000_000_000_000n ||
          BigInt(bill.quote.grandTotalIdr) > 9_000_000_000_000_000n) {
        return apiError(422, "BILL_TOTAL_TOO_LARGE", "Bill exceeds the supported amount");
      }
      const cash = BigInt(body.cashReceivedIdr);
      const total = BigInt(bill.quote.grandTotalIdr);
      if (cash < total) return apiError(422, "CASH_INSUFFICIENT", "Cash received is below the bill total");
      const paymentId = randomUUID();
      const paidAt = new Date();
      const receiptSnapshot = {
        paymentId, storeName: settings.storeName, tableNumber: table.tableNumber,
        orders: bill.receiptOrders, subtotalIdr: bill.quote.subtotalIdr,
        discountIdr: bill.quote.discount.appliedAmountIdr,
        tax: { rateBps: settings.taxRateBps, amountIdr: bill.quote.tax.amountIdr },
        grandTotalIdr: bill.quote.grandTotalIdr,
        cashReceivedIdr: cash.toString(), changeIdr: (cash - total).toString(), paidAt,
      };
      const [payment] = await tx.insert(payments).values({
        id: paymentId, sessionId, cashierUserId: staff.userId, idempotencyKey: body.idempotencyKey,
        subtotalIdr: BigInt(bill.quote.subtotalIdr),
        discountEnabled: settings.discountEnabled,
        configuredDiscountIdr: settings.discountAmountIdr ?? 0n,
        discountAppliedIdr: BigInt(bill.quote.discount.appliedAmountIdr),
        taxEnabled: settings.taxEnabled, taxRateBps: settings.taxRateBps,
        taxAmountIdr: BigInt(bill.quote.tax.amountIdr), grandTotalIdr: total,
        cashReceivedIdr: cash, changeIdr: cash - total,
        sessionRevision: session.billRevision, settingsVersion: settings.version,
        receiptSnapshot, paidAt,
      }).returning();
      await tx.update(tableSessions).set({
        closedAt: paidAt, closureReason: "PAID", closedByUserId: staff.userId,
      }).where(eq(tableSessions.id, sessionId));
      await tx.update(diningTables).set({
        status: "AVAILABLE", cycleNumber: sql`${diningTables.cycleNumber} + 1`, updatedAt: paidAt,
      }).where(eq(diningTables.id, table.id));
      await tx.insert(auditEvents).values({
        actorUserId: staff.userId, actorType: "STAFF", action: "SESSION_PAID",
        entityType: "PAYMENT", entityId: payment.id, tableId: table.id, sessionId,
        details: { grandTotalIdr: total.toString(), cashReceivedIdr: cash.toString() },
      });
      return apiSuccess(paymentData(payment), 201);
    });
  } catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if (pg.code === "23505" || pg.cause?.code === "23505") {
      return apiError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new key for a different payment");
    }
    throw error;
  }
}
