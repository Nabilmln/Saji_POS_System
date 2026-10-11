import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { billingData, parseBody } from "@/lib/admin/master-data";
import { requireAdmin } from "@/lib/auth/guards";
import { billingSettingsSchema } from "@/lib/contracts";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return settings ? apiSuccess(billingData(settings)) : apiError(503, "SETTINGS_UNAVAILABLE", "Billing settings missing");
}

export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, billingSettingsSchema);
  if (body instanceof Response) return body;
  const [settings] = await db.update(storeSettings).set({
    discountEnabled: body.discountEnabled,
    discountAmountIdr: BigInt(body.discountAmountIdr),
    taxEnabled: body.taxEnabled, taxRateBps: body.taxRateBps,
    version: sql`${storeSettings.version} + 1`,
    updatedByUserId: admin.userId, updatedAt: new Date(),
  }).where(and(eq(storeSettings.id, 1), eq(storeSettings.version, BigInt(body.expectedVersion))))
    .returning();
  if (settings) return apiSuccess(billingData(settings));
  const [current] = await db.select({ id: storeSettings.id }).from(storeSettings).where(eq(storeSettings.id, 1));
  return current ? apiError(409, "SETTINGS_CHANGED", "Refetch billing settings and retry")
    : apiError(503, "SETTINGS_UNAVAILABLE", "Billing settings missing");
}
