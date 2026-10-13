import { and, asc, count, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { db } from "@/db";
import { menuItems } from "@/db/schema";
import { apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { idSchema, menuData, menuSchema, missingCategory, parseBody } from "@/lib/admin/master-data";

const querySchema = z.strictObject({
  q: z.string().trim().max(160).optional(),
  categoryId: idSchema.optional(),
  available: z.enum(["true", "false"]).optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE).default(LIST_PAGE_SIZE),
});

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiValidationError(query.error);
  const { q, categoryId, available, includeArchived, page, pageSize } = query.data;
  const filter = and(
    includeArchived === "true" ? undefined : isNull(menuItems.archivedAt),
    categoryId ? eq(menuItems.categoryId, categoryId) : undefined,
    available ? eq(menuItems.isAvailable, available === "true") : undefined,
    q ? ilike(menuItems.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
  );
  const [items, totals] = await Promise.all([
    db.select().from(menuItems).where(filter).orderBy(asc(menuItems.name), asc(menuItems.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(menuItems).where(filter),
  ]);
  return apiSuccess({ items: items.map(menuData), total: totals[0].total, page, pageSize });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, menuSchema);
  if (body instanceof Response) return body;
  try {
    const [item] = await db.insert(menuItems).values({
      ...body, priceIdr: BigInt(body.priceIdr),
    }).returning();
    return apiSuccess(menuData(item), 201);
  } catch (error) {
    return missingCategory(error);
  }
}
