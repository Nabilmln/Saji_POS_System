import { expect, it } from "vitest";
import { resolveMenuImage } from "./menu-images";

it("uses generated art only for matching menus without replacing owner photos", () => {
  expect(resolveMenuImage(null, " Nasi Goreng ")).toBe("/images/menu/nasi-goreng.webp");
  expect(resolveMenuImage("https://images.example.test/owner.jpg", "Nasi Goreng")).toBe("https://images.example.test/owner.jpg");
  expect(resolveMenuImage(null, "Other dish")).toBeNull();
  expect(resolveMenuImage(null, "constructor")).toBeNull();
});
