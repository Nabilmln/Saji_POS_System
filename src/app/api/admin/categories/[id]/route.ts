import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { categoryPatchSchema, databaseConflict, parseBody, parseId } from "@/lib/admin/master-data";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  const body = await parseBody(request, categoryPatchSchema);
  if (body instanceof Response) return body;
  try {
    const [category] = await db.update(categories).set(body).where(eq(categories.id, id)).returning();
    return category ? apiSuccess(category) : apiError(404, "CATEGORY_NOT_FOUND", "Category not found");
  } catch (error) {
    return databaseConflict(error, "CATEGORY_EXISTS", "Category name already exists");
  }
}

export async function DELETE(request: Request, context: Context) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  try {
    const result = await db.transaction(async (tx) => {
      const [category] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
      if (!category) return "missing";
      const [menu] = await tx.select({ id: menuItems.id }).from(menuItems)
        .where(eq(menuItems.categoryId, id)).limit(1);
      if (menu) return "in-use";
      await tx.delete(categories).where(eq(categories.id, id));
      return category;
    });
    if (result === "missing") return apiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    if (result === "in-use") return apiError(409, "CATEGORY_IN_USE", "Deactivate this category instead");
    return apiSuccess(result);
  } catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if (pg.code === "23503" || pg.cause?.code === "23503") {
      return apiError(409, "CATEGORY_IN_USE", "Deactivate this category instead");
    }
    throw error;
  }
}
