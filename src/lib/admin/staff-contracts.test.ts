import { expect, it } from "vitest";
import { cashierAccountSchema } from "./staff-contracts";

it("requires owner-supplied cashier credentials and rejects owner registration", () => {
  const account = { email: "Cashier@example.test", displayName: "Kasir", password: "cashier-demo-123", role: "CASHIER" };
  expect(cashierAccountSchema.parse(account).email).toBe("cashier@example.test");
  expect(cashierAccountSchema.safeParse({ ...account, password: "short" }).success).toBe(false);
  expect(cashierAccountSchema.safeParse({ ...account, role: "ADMIN" }).success).toBe(false);
});
