import { expect, it } from "vitest";
import { revenueDays } from "./report-chart";

it("keeps missing days at zero without changing Paid amounts", () => {
  const days = revenueDays("2026-10-10", "2026-10-12", [{ date: "2026-10-11", revenueIdr: "9000000000000000", transactionCount: 1 }]);
  expect(days.map((day) => day.revenueIdr)).toEqual(["0", "9000000000000000", "0"]);
  expect(days.map((day) => day.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
});
