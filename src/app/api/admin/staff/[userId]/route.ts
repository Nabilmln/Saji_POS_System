import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, staffProfiles } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";

const patchSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { userId } = await context.params;
  if (!z.uuid().safeParse(userId).success) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
  const body = await parseBody(request, patchSchema);
  if (body instanceof Response) return body;
  return db.transaction(async (tx) => {
    // Serialize admin deactivations so two requests cannot remove the last active admin.
    await tx.execute(sql`select pg_advisory_xact_lock(1010)`);
    const [profile] = await tx.select().from(staffProfiles)
      .where(eq(staffProfiles.userId, userId)).for("update");
    if (!profile) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
    if (profile.role === "ADMIN" && profile.isActive && body.isActive === false) {
      const activeAdmins = await tx.select({ userId: staffProfiles.userId }).from(staffProfiles)
        .where(and(eq(staffProfiles.role, "ADMIN"), eq(staffProfiles.isActive, true)));
      if (activeAdmins.length <= 1) {
        return apiError(409, "LAST_ADMIN", "The last active admin cannot be deactivated");
      }
    }
    const [updated] = await tx.update(staffProfiles).set({
      ...body, updatedAt: new Date(),
    }).where(eq(staffProfiles.userId, userId)).returning();
    await tx.insert(auditEvents).values({
      actorUserId: admin.userId, actorType: "STAFF", action: "STAFF_UPDATED",
      entityType: "STAFF_PROFILE", entityId: userId,
      details: { before: { displayName: profile.displayName, isActive: profile.isActive },
        after: { displayName: updated.displayName, isActive: updated.isActive } },
    });
    return apiSuccess({
      userId: updated.userId, displayName: updated.displayName,
      role: updated.role, isActive: updated.isActive, createdAt: updated.createdAt,
    });
  });
}
