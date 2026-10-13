import { expect, it } from "vitest";
import english from "./en.json";
import { readLocale, translate } from "./translate";

it("switches labels and messages without changing interpolated restaurant data", () => {
  expect(readLocale("fr")).toBe("id");
  expect(readLocale("en")).toBe("en");
  expect(translate("en", "Bayar tunai")).toBe("Pay cash");
  expect(translate("id", "Bayar tunai")).toBe("Bayar tunai");
  expect(translate("en", "Tambahkan {0} ke keranjang", { 0: "Nasi <special>" })).toBe("Add Nasi <special> to cart");
  expect(translate("en", "Menu Nasi Goreng diarsipkan.")).toBe("Menu item Nasi Goreng archived.");
  expect(translate("id", "Menu item Nasi Goreng archived.")).toBe("Menu Nasi Goreng diarsipkan.");
  expect(translate("en", "Unknown restaurant dish")).toBe("Unknown restaurant dish");
  expect(translate("en", "constructor")).toBe("constructor");
});

it("keeps all translation parameters and provides nonempty English copy", () => {
  for (const [id, en] of Object.entries(english)) {
    expect(en.trim(), id).not.toBe("");
    const parameters = (text: string) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
    expect(parameters(en), id).toEqual(parameters(id));
  }
});
