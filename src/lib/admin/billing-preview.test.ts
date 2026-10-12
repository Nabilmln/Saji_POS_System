import { describe, expect, it } from "vitest";
import { bpsToPercent, percentToBps } from "./billing-preview";

describe("billing rate input", () => {
  it("converts decimal percent to integer basis points", () => {
    expect(percentToBps("7.75")).toBe(775);
    expect(percentToBps("0.1")).toBe(10);
    expect(percentToBps("100")).toBe(10000);
    expect(bpsToPercent(775)).toBe("7.75");
    expect(bpsToPercent(1000)).toBe("10");
    expect(bpsToPercent(0)).toBe("0");
  });
  it("rejects rates outside the API contract", () => {
    expect(percentToBps("100.01")).toBeNull();
    expect(percentToBps("7.777")).toBeNull();
    expect(percentToBps("-1")).toBeNull();
  });
});
