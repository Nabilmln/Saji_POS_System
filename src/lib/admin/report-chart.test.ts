import { expect, it } from "vitest";
import { revenueDays, revenueInsights } from "./report-chart";

it("keeps missing days at zero without changing Paid amounts", () => {
  const days = revenueDays("2026-10-10", "2026-10-12", [{ date: "2026-10-11", revenueIdr: "9000000000000000", transactionCount: 1 }]);
  expect(days.map((day) => day.revenueIdr)).toEqual(["0", "9000000000000000", "0"]);
  expect(days.map((day) => day.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
});

it("includes zero days in the daily average and finds the peak share from paid revenue", () => {
  const days = revenueDays("2026-10-10", "2026-10-13", [
    { date: "2026-10-10", revenueIdr: "100000", transactionCount: 2 },
    { date: "2026-10-12", revenueIdr: "300000", transactionCount: 3 },
  ]);
  expect(revenueInsights(days)).toEqual({ paidDays: 2, averageDailyIdr: 100000n, best: days[2], bestSharePercent: 75 });
});

it("keeps large currency exact and selects the earliest tied peak", () => {
  const days = revenueDays("2026-10-10", "2026-10-12", [
    { date: "2026-10-12", revenueIdr: "90071992547409931", transactionCount: 1 },
    { date: "2026-10-10", revenueIdr: "90071992547409931", transactionCount: 1 },
  ]);
  expect(revenueInsights(days)).toEqual({ paidDays: 2, averageDailyIdr: 60047995031606620n, best: days[0], bestSharePercent: 50 });
});

it("distinguishes no payments from paid transactions with zero revenue", () => {
  expect(revenueInsights([])).toEqual({ paidDays: 0, averageDailyIdr: 0n, best: null, bestSharePercent: null });
  const emptyDays = revenueDays("2026-10-10", "2026-10-12", []);
  expect(revenueInsights(emptyDays).best).toBeNull();
  const days = revenueDays("2026-10-10", "2026-10-12", [{ date: "2026-10-11", revenueIdr: "0", transactionCount: 1 }]);
  expect(revenueInsights(days)).toEqual({ paidDays: 1, averageDailyIdr: 0n, best: days[1], bestSharePercent: null });
});
