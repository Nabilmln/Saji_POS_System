import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, diningTables, menuItems } from "@/db/schema";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireGuest } from "@/lib/public/tokens";

const querySchema = z.strictObject({
  q: z.string().trim().max(160).optional(),
  categoryId: z.uuid().optional(),
});

export async function GET(request: Request, context: { params: Promise<{ tableToken: string }> }) {
  const guest = requireGuest(request);
  if (guest instanceof Response) return guest;
  const { tableToken } = await context.params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(tableToken)) {
    return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const [table] = await db.select({
    id: diningTables.id, tableNumber: diningTables.tableNumber, cycleNumber: diningTables.cycleNumber,
  }).from(diningTables).where(and(eq(diningTables.qrToken, tableToken), eq(diningTables.isActive, true)));
  if (!table) return apiError(404, "INVALID_TABLE_TOKEN", "Table not found");
  if (guest.tableId !== table.id || guest.cycleNumber !== table.cycleNumber) {
    return apiError(403, "GUEST_SCOPE_CHANGED", "Enter your name again for this table");
  }

  const categoryRows = await db.select({ id: categories.id, name: categories.name })
    .from(categories).where(and(eq(categories.isActive, true),
      parsed.data.categoryId ? eq(categories.id, parsed.data.categoryId) : undefined))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const items = categoryRows.length ? await db.select({
    id: menuItems.id, categoryId: menuItems.categoryId, name: menuItems.name,
    description: menuItems.description, imageUrl: menuItems.imageUrl, priceIdr: menuItems.priceIdr,
  }).from(menuItems).innerJoin(categories, eq(categories.id, menuItems.categoryId)).where(and(
    eq(categories.isActive, true), eq(menuItems.isAvailable, true), isNull(menuItems.archivedAt),
    parsed.data.categoryId ? eq(menuItems.categoryId, parsed.data.categoryId) : undefined,
    parsed.data.q ? ilike(menuItems.name, `%${parsed.data.q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
  )).orderBy(asc(menuItems.name), asc(menuItems.id)) : [];
  return apiSuccess({
    tableNumber: table.tableNumber,
    categories: categoryRows.map((category) => ({
      ...category,
      items: items.filter((item) => item.categoryId === category.id).map((item) => ({
        id: item.id, name: item.name, description: item.description,
        imageUrl: item.imageUrl, priceIdr: item.priceIdr.toString(),
      })),
    })),
  });
}
