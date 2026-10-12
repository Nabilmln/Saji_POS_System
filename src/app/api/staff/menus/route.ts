import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const [categoryRows, items] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories)
      .where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select({
      id: menuItems.id, categoryId: menuItems.categoryId, name: menuItems.name,
      description: menuItems.description, imageUrl: menuItems.imageUrl, priceIdr: menuItems.priceIdr,
    }).from(menuItems).innerJoin(categories, eq(menuItems.categoryId, categories.id))
      .where(and(eq(categories.isActive, true), eq(menuItems.isAvailable, true), isNull(menuItems.archivedAt)))
      .orderBy(asc(menuItems.name), asc(menuItems.id)),
  ]);
  return apiSuccess({ categories: categoryRows.map((category) => ({
    ...category,
    items: items.filter((item) => item.categoryId === category.id).map((item) => ({
      id: item.id, name: item.name, description: item.description,
      imageUrl: item.imageUrl, priceIdr: item.priceIdr.toString(),
    })),
  })) });
}
