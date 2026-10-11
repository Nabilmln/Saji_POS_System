import { z } from "zod";
import { apiError, apiValidationError } from "../api-response";
import { moneyIdrSchema } from "../contracts";

const name = (max: number) => z.string().trim().min(1).max(max);
export const idSchema = z.uuid();
export const categorySchema = z.strictObject({
  name: name(120),
  sortOrder: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  isActive: z.boolean(),
});
export const categoryPatchSchema = categorySchema.partial().refine((value) => Object.keys(value).length > 0);

export const imageUrlSchema = z.url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.hash;
}, "Use an HTTPS image URL without credentials or a fragment");

export const menuSchema = z.strictObject({
  categoryId: idSchema,
  name: name(160),
  description: z.string().trim().max(2000).nullable(),
  priceIdr: moneyIdrSchema,
  imageUrl: imageUrlSchema.nullable(),
  isAvailable: z.boolean(),
});
export const menuPatchSchema = menuSchema.partial().refine((value) => Object.keys(value).length > 0);
export const availabilitySchema = z.strictObject({ isAvailable: z.boolean() });
export const tableSchema = z.strictObject({ tableNumber: name(30) });
export const tablePatchSchema = tableSchema.extend({ isActive: z.boolean() }).partial()
  .refine((value) => Object.keys(value).length > 0);

export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Expected a JSON request body");
  }
  const result = schema.safeParse(body);
  return result.success ? result.data : apiValidationError(result.error);
}

export function parseId(id: string): Response | string {
  const parsed = idSchema.safeParse(id);
  return parsed.success ? parsed.data : apiValidationError(parsed.error);
}

export function databaseConflict(error: unknown, code: string, message: string): Response {
  const pg = error as { code?: string; cause?: { code?: string } };
  if (pg.code === "23505" || pg.cause?.code === "23505") return apiError(409, code, message);
  throw error;
}

export function missingCategory(error: unknown): Response {
  const pg = error as { code?: string; cause?: { code?: string } };
  if (pg.code === "23503" || pg.cause?.code === "23503") {
    return apiError(422, "CATEGORY_NOT_FOUND", "Category does not exist");
  }
  throw error;
}

export function menuData(item: {
  id: string; categoryId: string; name: string; description: string | null;
  imageUrl: string | null; priceIdr: bigint; isAvailable: boolean;
  archivedAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return { ...item, priceIdr: item.priceIdr.toString() };
}

export function tableData(table: {
  id: string; tableNumber: string; qrToken: string; status: string;
  isActive: boolean; cycleNumber: number; createdAt: Date; updatedAt: Date;
}) {
  // QR carries only the public route; the token is never returned as a separate field.
  return {
    id: table.id, tableNumber: table.tableNumber, status: table.status,
    isActive: table.isActive, cycleNumber: table.cycleNumber,
    orderUrl: `/order/${table.qrToken}`,
    createdAt: table.createdAt, updatedAt: table.updatedAt,
  };
}

export function billingData(settings: {
  discountEnabled: boolean; discountAmountIdr: bigint; taxEnabled: boolean;
  taxRateBps: number; version: bigint; updatedAt: Date;
}) {
  return {
    discountEnabled: settings.discountEnabled,
    discountAmountIdr: settings.discountAmountIdr.toString(),
    taxEnabled: settings.taxEnabled, taxRateBps: settings.taxRateBps,
    version: settings.version.toString(), updatedAt: settings.updatedAt,
  };
}
