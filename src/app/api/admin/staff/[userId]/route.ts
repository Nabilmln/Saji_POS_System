import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, staffProfiles } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";

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
    const [profile] = await tx.select().from(staffProfiles)
      .where(eq(staffProfiles.userId, userId)).for("update");
    if (!profile || profile.deletedAt) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
    if (profile.role === "ADMIN" && body.isActive === false) {
      return apiError(409, "OWNER_PROTECTED", "The exclusive owner account cannot be deactivated");
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

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { userId } = await context.params;
  if (!z.uuid().safeParse(userId).success) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).for("update");
    if (!profile || profile.deletedAt) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
    if (profile.role === "ADMIN") return apiError(409, "OWNER_PROTECTED", "The exclusive owner account cannot be deleted");
    try {
      const result = await auth.admin.banUser({ userId, banReason: "Deleted cashier account" });
      if (result.error) return apiError(503, "AUTH_UNAVAILABLE", "Cashier access could not be revoked");
    } catch {
      return apiError(503, "AUTH_UNAVAILABLE", "Cashier access could not be revoked");
    }
    const deletedAt = new Date();
    await tx.update(staffProfiles).set({ isActive: false, deletedAt, updatedAt: deletedAt }).where(eq(staffProfiles.userId, userId));
    await tx.insert(auditEvents).values({
      actorUserId: admin.userId, actorType: "STAFF", action: "STAFF_DELETED",
      entityType: "STAFF_PROFILE", entityId: userId, details: { displayName: profile.displayName },
    });
    return apiSuccess({ userId, deletedAt });
  });
}
