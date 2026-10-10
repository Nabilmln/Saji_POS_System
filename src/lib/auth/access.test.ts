import { describe, expect, it } from "vitest";
import { authorizeStaff, hasValidMutationOrigin, type StaffIdentity } from "./access";

const cashier: StaffIdentity = { userId: "user-1", displayName: "Kasir", role: "CASHIER", isActive: true };

describe("staff access", () => {
  it("rejects missing sessions, missing profiles, and inactive staff", () => {
    expect(authorizeStaff(undefined, undefined)).toHaveProperty("status", 401);
    expect(authorizeStaff(cashier.userId, undefined)).toHaveProperty("status", 403);
    expect(authorizeStaff("other-user", cashier)).toHaveProperty("status", 403);
    expect(authorizeStaff(cashier.userId, { ...cashier, isActive: false })).toHaveProperty("status", 403);
  });

  it("allows staff routes but reserves admin routes for admins", () => {
    expect(authorizeStaff(cashier.userId, cashier)).toEqual(cashier);
    expect(authorizeStaff(cashier.userId, cashier, "ADMIN")).toHaveProperty("status", 403);
    const admin: StaffIdentity = { ...cashier, role: "ADMIN" };
    expect(authorizeStaff(admin.userId, admin, "ADMIN")).toEqual(admin);
  });

  it("rejects cross-origin mutations", () => {
    const url = "https://pos.example/api/admin/settings/billing";
    expect(hasValidMutationOrigin(new Request(url, { method: "PUT" }))).toBe(false);
    expect(hasValidMutationOrigin(new Request(url, { method: "PUT", headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(hasValidMutationOrigin(new Request(url, { method: "PUT", headers: { origin: "https://pos.example", "sec-fetch-site": "cross-site" } }))).toBe(false);
    expect(hasValidMutationOrigin(new Request(url, { method: "PUT", headers: { origin: "https://pos.example", "sec-fetch-site": "same-origin" } }))).toBe(true);
  });
});
