import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, categories } from "@/db/schema";
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
    const [category] = await db.update(categories).set(body).where(and(eq(categories.id, id), isNull(categories.deletedAt))).returning();
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
  return db.transaction(async (tx) => {
    const [category] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
    if (!category || category.deletedAt) return apiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    const deletedAt = new Date();
    await tx.update(categories).set({ deletedAt, isActive: false }).where(eq(categories.id, id));
    await tx.insert(auditEvents).values({
      actorUserId: admin.userId, actorType: "STAFF", action: "CATEGORY_DELETED",
      entityType: "CATEGORY", entityId: id, details: { name: category.name },
    });
    return apiSuccess({ id, deletedAt });
  });
}
