import { expect, it } from "vitest";
import { categoryPatchSchema, imageUrlSchema, menuSchema, missingCategory, tableData, tablePatchSchema } from "./master-data";

it("validates master data and returns a relative QR destination", () => {
  expect(categoryPatchSchema.safeParse({}).success).toBe(false);
  expect(tablePatchSchema.safeParse({ status: "OCCUPIED" }).success).toBe(false);
  expect(imageUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  expect(imageUrlSchema.safeParse("https://user:pass@example.com/p.png").success).toBe(false);
  expect(imageUrlSchema.safeParse("https://example.com/p.png").success).toBe(true);
  expect(menuSchema.safeParse({
    categoryId: "11111111-1111-4111-8111-111111111111",
    name: "Tea", description: null, priceIdr: "25000", imageUrl: null, isAvailable: true,
    stockQuantity: 4,
  }).success).toBe(false);
  expect(tableData({
    id: "id", tableNumber: "05", qrToken: "secret-token", status: "AVAILABLE",
    isActive: true, cycleNumber: 0, createdAt: new Date(), updatedAt: new Date(),
  }).orderUrl).toBe("/order/secret-token");
  expect(missingCategory({ cause: { code: "23503" } }).status).toBe(422);
});
