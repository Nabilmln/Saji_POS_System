import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { apiError } from "@/lib/api-response";
import { db } from "@/db";
import { staffProfiles } from "@/db/schema";
import { hasValidMutationOrigin, authorizeStaff, type StaffIdentity, type StaffRole } from "./access";
import { auth } from "./server";

async function requireRole(request: Request, role: StaffRole | null): Promise<StaffIdentity | Response> {
  await connection();
  if (!hasValidMutationOrigin(request)) {
    return apiError(403, "INVALID_ORIGIN", "Same-origin request required");
  }

  // The SDK bypasses its signed-cookie cache only when this query value is the string "true".
  const { data: session, error } = await auth.getSession({ query: { disableCookieCache: "true" } });
  if (error) return apiError(503, "AUTH_UNAVAILABLE", "Authentication service unavailable");
  const userId = session?.user?.id;
  if (!userId) return authorizeStaff(undefined, undefined, role);

  const profile = await db.query.staffProfiles.findFirst({
    where: and(eq(staffProfiles.userId, userId), isNull(staffProfiles.deletedAt)),
    columns: { userId: true, displayName: true, role: true, isActive: true },
  });
  return authorizeStaff(userId, profile as StaffIdentity | undefined, role);
}

export function requireAccount(request: Request) {
  return requireRole(request, null);
}

export function requireStaff(request: Request) {
  return requireRole(request, "CASHIER");
}

export function requireAdmin(request: Request) {
  return requireRole(request, "ADMIN");
}
