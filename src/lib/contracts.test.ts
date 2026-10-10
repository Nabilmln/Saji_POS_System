import { describe, expect, it } from "vitest";
import {
  billingSettingsSchema,
  checkoutSchema,
  decimalString,
  moneyIdrSchema,
  paymentSchema,
  revisionSchema,
} from "./contracts";
import { apiValidationError } from "./api-response";
import { restaurantDate } from "./time";

const requestKey = "29cd46bc-c351-4512-87a4-8d4e7a416104";
const menuItemId = "c53016f5-d01e-4c66-8bd9-912739776045";

describe("API contracts", () => {
  it("accepts decimal rupiah strings without losing bigint precision", () => {
    expect(moneyIdrSchema.safeParse("9000000000000000").success).toBe(true);
    expect(moneyIdrSchema.safeParse("9000000000000001").success).toBe(false);
    expect(moneyIdrSchema.safeParse(1000).success).toBe(false);
    expect(moneyIdrSchema.safeParse("01").success).toBe(false);
    expect(moneyIdrSchema.safeParse("9".repeat(1000)).success).toBe(false);
    expect(decimalString(9_000_000_000_000_000n)).toBe("9000000000000000");
    expect(revisionSchema.safeParse("0").success).toBe(false);
  });

  it("rejects duplicate checkout lines and client-supplied prices", () => {
    const base = {
      expectedCycleNumber: 0,
      clientRequestKey: requestKey,
      items: [{ menuItemId, quantity: 2 }],
    };
    expect(checkoutSchema.safeParse(base).success).toBe(true);
    expect(
      checkoutSchema.safeParse({ ...base, items: [...base.items, ...base.items] })
        .success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({
        ...base,
        items: [...base.items, { menuItemId: menuItemId.toUpperCase(), quantity: 1 }],
      }).success,
    ).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, subtotalIdr: "1" }).success).toBe(
      false,
    );
  });

  it("requires positive quote versions and valid billing settings", () => {
    expect(
      paymentSchema.safeParse({
        idempotencyKey: requestKey,
        expectedSessionRevision: "0",
        expectedSettingsVersion: "1",
        cashReceivedIdr: "10000",
      }).success,
    ).toBe(false);
    expect(
      billingSettingsSchema.safeParse({
        expectedVersion: "1",
        discountEnabled: false,
        discountAmountIdr: "0",
        taxEnabled: true,
        taxRateBps: 10001,
      }).success,
    ).toBe(false);
  });

  it("returns field errors without leaking the input", async () => {
    const parsed = paymentSchema.safeParse({ cashReceivedIdr: "secret" });
    if (parsed.success) throw new Error("Expected validation failure");
    const response = apiValidationError(parsed.error);
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields.cashReceivedIdr).toBeDefined();
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("uses the restaurant calendar day at the UTC boundary", () => {
    expect(restaurantDate(new Date("2026-10-10T16:59:59Z"))).toBe(
      "2026-10-10",
    );
    expect(restaurantDate(new Date("2026-10-10T17:00:00Z"))).toBe(
      "2026-10-11",
    );
  });
});
