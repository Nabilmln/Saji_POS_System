import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, diningTables, menuItems, orderItems, orders, tableSessions } from "@/db/schema";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api-response";
import { checkoutFingerprint } from "@/lib/checkout";
import { checkoutSchema } from "@/lib/contracts";
import { issueOrderViewToken, requireGuest } from "@/lib/public/tokens";
import { limitPublicRequests } from "@/lib/public/rate-limit";

function orderResponse(
  order: typeof orders.$inferSelect,
  items: (typeof orderItems.$inferSelect)[],
  table: typeof diningTables.$inferSelect,
) {
  return {
    orderId: order.id, sessionId: order.sessionId, tableNumber: table.tableNumber,
    customerName: order.customerName, source: "QR", status: "PENDING",
    items: items.sort((a, b) => (a.menuItemId ?? "").localeCompare(b.menuItemId ?? "")).map((item) => ({
      id: item.id, menuName: item.menuNameSnapshot, quantity: item.quantity,
      unitPriceIdr: item.unitPriceIdr.toString(),
      lineTotalIdr: (item.unitPriceIdr * BigInt(item.quantity)).toString(), served: false,
    })),
    orderViewToken: issueOrderViewToken(order.id, table.id, order.createdAt),
    createdAt: order.createdAt,
  };
}

export async function POST(request: Request, context: { params: Promise<{ tableToken: string }> }) {
  const guest = requireGuest(request);
  if (guest instanceof Response) return guest;
  const { tableToken } = await context.params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(tableToken)) {
    return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
  }
  let input: unknown;
  try { input = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Expected a JSON request body"); }
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return apiValidationError(parsed.error);
  const body = parsed.data;
  const key = request.headers.get("idempotency-key");
  if (key && (!z.uuid().safeParse(key).success || key.toLowerCase() !== body.clientRequestKey.toLowerCase())) {
    return apiError(422, "VALIDATION_ERROR", "Idempotency-Key must match clientRequestKey");
  }

  const limited = await limitPublicRequests(guest.tableId, "order");
  if (limited) return limited;

  try {
    return await db.transaction(async (tx) => {
      const [table] = await tx.select().from(diningTables)
        .where(and(eq(diningTables.qrToken, tableToken), eq(diningTables.isActive, true))).for("update");
      if (!table) return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
      if (guest.tableId !== table.id) return apiError(403, "GUEST_SCOPE_CHANGED", "Enter your name again for this table");
      if (guest.cycleNumber !== table.cycleNumber || body.expectedCycleNumber !== table.cycleNumber) {
        return apiError(409, "TABLE_CYCLE_CHANGED", "Refresh the table and enter your name again");
      }
      const fingerprint = checkoutFingerprint(table.id, guest.customerName, body);
      const [existing] = await tx.select().from(orders).where(eq(orders.clientRequestKey, body.clientRequestKey));
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          return apiError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new key for a different order");
        }
        const savedItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, existing.id))
          .orderBy(asc(orderItems.menuItemId));
        return apiSuccess(orderResponse(existing, savedItems, table));
      }
      if (table.status === "RESERVED") return apiError(409, "TABLE_RESERVED", "Ask the cashier to check in this table");

      const menuIds = body.items.map((item) => item.menuItemId.toLowerCase());
      const available = await tx.select({
        id: menuItems.id, name: menuItems.name, priceIdr: menuItems.priceIdr,
      }).from(menuItems).innerJoin(categories, eq(menuItems.categoryId, categories.id))
        .where(and(inArray(menuItems.id, menuIds), eq(menuItems.isAvailable, true),
          isNull(menuItems.archivedAt), eq(categories.isActive, true))).for("share");
      if (available.length !== body.items.length) {
        return apiError(409, "MENU_UNAVAILABLE", "Refresh the menu and remove unavailable items");
      }
      const menuById = new Map(available.map((item) => [item.id, item]));
      const total = body.items.reduce((sum, item) => sum + menuById.get(item.menuItemId.toLowerCase())!.priceIdr * BigInt(item.quantity), 0n);
      if (total > 9_000_000_000_000_000n) {
        return apiError(422, "ORDER_TOTAL_TOO_LARGE", "Order total exceeds the supported amount");
      }

      let sessionId: string;
      if (table.status === "AVAILABLE") {
        const [session] = await tx.insert(tableSessions).values({ tableId: table.id }).returning({ id: tableSessions.id });
        sessionId = session.id;
        await tx.update(diningTables).set({ status: "OCCUPIED", updatedAt: new Date() })
          .where(eq(diningTables.id, table.id));
      } else {
        const [session] = await tx.select({ id: tableSessions.id }).from(tableSessions)
          .where(and(eq(tableSessions.tableId, table.id), isNull(tableSessions.closedAt))).limit(1);
        if (!session) return apiError(409, "SESSION_NOT_ACTIVE", "Ask the cashier to reopen this table");
        sessionId = session.id;
      }
      const [order] = await tx.insert(orders).values({
        sessionId, customerName: guest.customerName, source: "QR",
        note: body.note || null, clientRequestKey: body.clientRequestKey,
        requestFingerprint: fingerprint,
      }).returning();
      const savedItems = await tx.insert(orderItems).values(body.items.map((item) => ({
        orderId: order.id, menuItemId: item.menuItemId,
        menuNameSnapshot: menuById.get(item.menuItemId.toLowerCase())!.name,
        unitPriceIdr: menuById.get(item.menuItemId.toLowerCase())!.priceIdr,
        quantity: item.quantity, customerNote: item.note || null,
      }))).returning();
      await tx.update(tableSessions).set({ billRevision: sql`${tableSessions.billRevision} + 1` })
        .where(eq(tableSessions.id, sessionId));
      return apiSuccess(orderResponse(order, savedItems, table), 201);
    });
  } catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if (pg.code === "23505" || pg.cause?.code === "23505") {
      return apiError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new key for a different order");
    }
    throw error;
  }
}
