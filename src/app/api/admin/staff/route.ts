import { randomBytes } from "node:crypto";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, staffProfiles } from "@/db/schema";
import { parseBody } from "@/lib/admin/master-data";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";

const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const createSchema = z.strictObject({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(120),
  role: z.literal("CASHIER"),
});

function staffData(profile: typeof staffProfiles.$inferSelect) {
  return {
    userId: profile.userId, displayName: profile.displayName, role: profile.role,
    isActive: profile.isActive, createdAt: profile.createdAt,
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);
  const { page, pageSize } = parsed.data;
  const rows = await db.select().from(staffProfiles)
    .orderBy(asc(staffProfiles.createdAt), asc(staffProfiles.userId))
    .limit(pageSize).offset((page - 1) * pageSize);
  return apiSuccess(rows.map(staffData));
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await parseBody(request, createSchema);
  if (body instanceof Response) return body;
  let created;
  try {
    created = await auth.admin.createUser({
      email: body.email, name: body.displayName,
      password: randomBytes(32).toString("base64url"), role: "user",
    });
  } catch {
    return apiError(503, "AUTH_USER_CREATE_FAILED", "Neon Auth could not create the cashier account");
  }
  if (created.error || !created.data?.user?.id) {
    return apiError(created.error?.status === 422 ? 409 : 503,
      "AUTH_USER_CREATE_FAILED", "Neon Auth could not create the cashier account");
  }
  const userId = created.data.user.id;
  try {
    const reset = await auth.requestPasswordReset({ email: body.email, redirectTo: new URL("/reset-password", request.url).href });
    if (reset.error) throw new Error("Password setup email failed");
    const profile = await db.transaction(async (tx) => {
      const [saved] = await tx.insert(staffProfiles).values({
        userId, displayName: body.displayName, role: "CASHIER",
      }).returning();
      await tx.insert(auditEvents).values({
        actorUserId: admin.userId, actorType: "STAFF", action: "STAFF_CREATED",
        entityType: "STAFF_PROFILE", entityId: userId,
        details: { role: "CASHIER" },
      });
      return saved;
    });
    return apiSuccess({ ...staffData(profile), setupEmailSent: true }, 201);
  } catch {
    try {
      const removed = await auth.admin.removeUser({ userId });
      if (removed.error) throw new Error("Auth cleanup failed");
    } catch {
      return apiError(503, "AUTH_CLEANUP_FAILED",
        "Cashier setup failed; the unused Auth account needs administrator cleanup");
    }
    return apiError(503, "STAFF_SETUP_FAILED", "Cashier setup failed; retry after checking Auth email delivery");
  }
}
