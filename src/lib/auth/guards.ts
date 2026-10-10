import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { apiError } from "@/lib/api-response";
import { db } from "@/db";
import { staffProfiles } from "@/db/schema";
import { hasValidMutationOrigin, authorizeStaff, type StaffIdentity, type StaffRole } from "./access";
import { auth } from "./server";

async function requireRole(request: Request, role: StaffRole): Promise<StaffIdentity | Response> {
  await connection();
  if (!hasValidMutationOrigin(request)) {
    return apiError(403, "INVALID_ORIGIN", "Same-origin request required");
  }

  const { data: session, error } = await auth.getSession();
  if (error) return apiError(503, "AUTH_UNAVAILABLE", "Authentication service unavailable");
  const userId = session?.user?.id;
  if (!userId) return authorizeStaff(undefined, undefined, role);

  const profile = await db.query.staffProfiles.findFirst({
    where: eq(staffProfiles.userId, userId),
    columns: { userId: true, displayName: true, role: true, isActive: true },
  });
  return authorizeStaff(userId, profile as StaffIdentity | undefined, role);
}

export function requireStaff(request: Request) {
  return requireRole(request, "CASHIER");
}

export function requireAdmin(request: Request) {
  return requireRole(request, "ADMIN");
}
