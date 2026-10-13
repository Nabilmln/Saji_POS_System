import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, staffProfiles } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { cashierAccountSchema } from "@/lib/admin/staff-contracts";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";

const passwordSchema = z.strictObject({ password: cashierAccountSchema.shape.password });

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { userId } = await context.params;
  if (!z.uuid().safeParse(userId).success) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
  const body = await parseBody(request, passwordSchema);
  if (body instanceof Response) return body;
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).for("update");
    if (!profile || profile.deletedAt) return apiError(404, "STAFF_NOT_FOUND", "Staff account not found");
    if (profile.role === "ADMIN") return apiError(409, "OWNER_PROTECTED", "Use the owner's password recovery flow");
    try {
      // Revoke first: a failed password change must not leave a newly changed password with old sessions.
      const revoked = await auth.admin.revokeUserSessions({ userId });
      if (revoked.error) return apiError(503, "AUTH_UNAVAILABLE", "Cashier sessions could not be revoked");
      const changed = await auth.admin.setUserPassword({ userId, newPassword: body.password });
      if (changed.error) return apiError(503, "AUTH_PASSWORD_FAILED", "Cashier password could not be changed");
    } catch {
      return apiError(503, "AUTH_PASSWORD_FAILED", "Cashier password could not be changed; existing sessions may have been revoked");
    }
    await tx.insert(auditEvents).values({
      actorUserId: admin.userId, actorType: "STAFF", action: "STAFF_PASSWORD_RESET",
      entityType: "STAFF_PROFILE", entityId: userId,
    });
    return apiSuccess({ userId, passwordChanged: true });
  });
}
