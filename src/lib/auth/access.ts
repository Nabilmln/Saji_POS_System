import { apiError } from "../api-response";

export type StaffRole = "ADMIN" | "CASHIER";

export type StaffIdentity = {
  userId: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
};

export function authorizeStaff(
  sessionUserId: string | undefined,
  profile: StaffIdentity | undefined,
  requiredRole: StaffRole = "CASHIER",
): StaffIdentity | Response {
  if (!sessionUserId) return apiError(401, "UNAUTHORIZED", "Sign in required");
  if (!profile || profile.userId !== sessionUserId || !profile.isActive) {
    return apiError(403, "STAFF_ACCESS_DENIED", "Active staff account required");
  }
  if (profile.role !== requiredRole) {
    return apiError(403, "FORBIDDEN", `${requiredRole === "ADMIN" ? "Owner" : "Cashier"} access required`);
  }
  return profile;
}

export function hasValidMutationOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return Boolean(origin && origin === new URL(request.url).origin && (!site || site === "same-origin"));
}
