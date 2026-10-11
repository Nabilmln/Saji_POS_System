import { z } from "zod";

const uuid = z.uuid();
const note = z.string().trim().max(500);

export const moneyIdrSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9]\d*)$/)
  .pipe(z.string().refine((value) => BigInt(value) <= 9_000_000_000_000_000n));

export const revisionSchema = z
  .string()
  .max(19)
  .regex(/^[1-9]\d*$/)
  .pipe(
    z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n),
  );

export const checkoutSchema = z
  .object({
    expectedCycleNumber: z.number().int().min(0).max(2_147_483_647),
    clientRequestKey: uuid,
    note: note.optional(),
    items: z
      .array(
        z.strictObject({
          menuItemId: uuid,
          quantity: z.number().int().min(1).max(99),
          note: note.optional(),
        }),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine(({ items }, context) => {
    const ids = new Set<string>();
    items.forEach(({ menuItemId }, index) => {
      const id = menuItemId.toLowerCase();
      if (ids.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "menuItemId"],
          message: "Menu item appears more than once",
        });
      }
      ids.add(id);
    });
  });

export const manualOrderSchema = z.strictObject({
  clientRequestKey: uuid,
  customerName: z.string().trim().min(1).max(120),
  note: note.optional(),
  items: checkoutSchema.shape.items,
}).superRefine(({ items }, context) => {
  const ids = new Set<string>();
  items.forEach(({ menuItemId }, index) => {
    const id = menuItemId.toLowerCase();
    if (ids.has(id)) context.addIssue({
      code: "custom", path: ["items", index, "menuItemId"], message: "Menu item appears more than once",
    });
    ids.add(id);
  });
});

export const paymentSchema = z.strictObject({
  idempotencyKey: uuid,
  expectedSessionRevision: revisionSchema,
  expectedSettingsVersion: revisionSchema,
  cashReceivedIdr: moneyIdrSchema,
});

export const billingSettingsSchema = z.strictObject({
  expectedVersion: revisionSchema,
  discountEnabled: z.boolean(),
  discountAmountIdr: moneyIdrSchema,
  taxEnabled: z.boolean(),
  taxRateBps: z.number().int().min(0).max(10_000),
});

export const voidSchema = z.strictObject({
  reasonType: z.enum(["CUSTOMER_REQUEST", "EMPLOYEE_ERROR"]),
  reasonDetail: z.string().trim().min(5).max(500),
});

export function decimalString(value: bigint): string {
  return value.toString();
}
