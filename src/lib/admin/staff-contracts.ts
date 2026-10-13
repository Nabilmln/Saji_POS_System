import { z } from "zod";

export const cashierAccountSchema = z.strictObject({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.literal("CASHIER"),
});
