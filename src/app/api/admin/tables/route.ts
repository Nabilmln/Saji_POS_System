import { randomBytes } from "node:crypto";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { diningTables } from "@/db/schema";
import { apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { databaseConflict, parseBody, tableData, tableSchema } from "@/lib/admin/master-data";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const rows = await db.select().from(diningTables).orderBy(asc(diningTables.tableNumber));
  return apiSuccess(rows.map(tableData));
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, tableSchema);
  if (body instanceof Response) return body;
  try {
    const [table] = await db.insert(diningTables).values({
      ...body, qrToken: randomBytes(32).toString("base64url"),
    }).returning();
    return apiSuccess(tableData(table), 201);
  } catch (error) {
    return databaseConflict(error, "TABLE_EXISTS", "Table number already exists");
  }
}
