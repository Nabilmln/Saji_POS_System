import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { menuItems } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { availabilitySchema, menuData, parseBody, parseId } from "@/lib/admin/master-data";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = parseId((await context.params).id);
  if (id instanceof Response) return id;
  const body = await parseBody(request, availabilitySchema);
  if (body instanceof Response) return body;
  const [item] = await db.update(menuItems).set({ ...body, updatedAt: new Date() })
    .where(and(eq(menuItems.id, id), isNull(menuItems.archivedAt))).returning();
  return item ? apiSuccess(menuData(item)) : apiError(404, "MENU_NOT_FOUND", "Menu item not found");
}
