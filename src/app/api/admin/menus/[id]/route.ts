import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { menuData, menuPatchSchema, parseBody, parseId } from "@/lib/admin/master-data";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id));
  return item ? apiSuccess(menuData(item)) : apiError(404, "MENU_NOT_FOUND", "Menu item not found");
}

export async function PATCH(request: Request, context: Context) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  const body = await parseBody(request, menuPatchSchema);
  if (body instanceof Response) return body;
  if (body.categoryId) {
    const [category] = await db.select({ id: categories.id }).from(categories)
      .where(eq(categories.id, body.categoryId)).limit(1);
    if (!category) return apiError(422, "CATEGORY_NOT_FOUND", "Category does not exist");
  }
  const { priceIdr, ...rest } = body;
  const [item] = await db.update(menuItems).set({
    ...rest, ...(priceIdr === undefined ? {} : { priceIdr: BigInt(priceIdr) }),
    updatedAt: new Date(),
  }).where(and(eq(menuItems.id, id), isNull(menuItems.archivedAt))).returning();
  return item ? apiSuccess(menuData(item)) : apiError(404, "MENU_NOT_FOUND", "Menu item not found");
}

export async function DELETE(request: Request, context: Context) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  const [item] = await db.update(menuItems).set({
    archivedAt: new Date(), isAvailable: false, updatedAt: new Date(),
  }).where(and(eq(menuItems.id, id), isNull(menuItems.archivedAt)))
    .returning({ archivedAt: menuItems.archivedAt });
  return item ? apiSuccess(item) : apiError(404, "MENU_NOT_FOUND", "Menu item not found");
}
