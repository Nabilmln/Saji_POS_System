import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { categorySchema, databaseConflict, parseBody } from "@/lib/admin/master-data";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const rows = await db.select({
    id: categories.id, name: categories.name, sortOrder: categories.sortOrder,
    isActive: categories.isActive, createdAt: categories.createdAt,
    menuCount: count(menuItems.id),
  }).from(categories).leftJoin(menuItems, eq(menuItems.categoryId, categories.id))
    .groupBy(categories.id).orderBy(asc(categories.sortOrder), asc(categories.name));
  return apiSuccess(rows);
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, categorySchema);
  if (body instanceof Response) return body;
  try {
    const [category] = await db.insert(categories).values(body).returning();
    return apiSuccess({ ...category, menuCount: 0 }, 201);
  } catch (error) {
    return databaseConflict(error, "CATEGORY_EXISTS", "Category name already exists");
  }
}
