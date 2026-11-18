import { describe, expect, it } from "vitest";
import { reportBounds, reportRangeSchema } from "./report-range";

describe("reportBounds", () => {
  it("calculates correct start and end boundaries for a single day", () => {
    const { start, end } = reportBounds("2026-11-16", "2026-11-16");
    expect(start.toISOString()).toBe(new Date("2026-11-16T00:00:00+07:00").toISOString());
    expect(end.toISOString()).toBe(new Date("2026-11-17T00:00:00+07:00").toISOString());
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("handles month-end rollover in non-leap year", () => {
    const { start, end } = reportBounds("2026-02-28", "2026-02-28");
    expect(start.toISOString()).toBe(new Date("2026-02-28T00:00:00+07:00").toISOString());
    expect(end.toISOString()).toBe(new Date("2026-03-01T00:00:00+07:00").toISOString());
  });

  it("handles leap year boundaries correctly", () => {
    const feb28 = reportBounds("2024-02-28", "2024-02-28");
    expect(feb28.end.toISOString()).toBe(new Date("2024-02-29T00:00:00+07:00").toISOString());

    const leapDay = reportBounds("2024-02-29", "2024-02-29");
    expect(leapDay.end.toISOString()).toBe(new Date("2024-03-01T00:00:00+07:00").toISOString());
  });

  it("handles year-end boundary into the new year", () => {
    const { start, end } = reportBounds("2026-12-31", "2026-12-31");
    expect(start.toISOString()).toBe(new Date("2026-12-31T00:00:00+07:00").toISOString());
    expect(end.toISOString()).toBe(new Date("2027-01-01T00:00:00+07:00").toISOString());
  });

  it("handles optional from and to bounds", () => {
    const fromOnly = reportBounds("2026-11-18", undefined);
    expect(fromOnly.start?.toISOString()).toBe(new Date("2026-11-18T00:00:00+07:00").toISOString());
    expect(fromOnly.end).toBeUndefined();

    const toOnly = reportBounds(undefined, "2026-11-18");
    expect(toOnly.start).toBeUndefined();
    expect(toOnly.end?.toISOString()).toBe(new Date("2026-11-19T00:00:00+07:00").toISOString());

    const neither = reportBounds();
    expect(neither.start).toBeUndefined();
    expect(neither.end).toBeUndefined();
  });
});

describe("reportRangeSchema", () => {
  it("accepts valid date ranges within 366 days", () => {
    expect(reportRangeSchema.safeParse({ from: "2026-11-16", to: "2026-11-16" }).success).toBe(true);
    expect(reportRangeSchema.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success).toBe(true);
  });

  it("rejects inverted date ranges where from > to", () => {
    const result = reportRangeSchema.safeParse({ from: "2026-11-17", to: "2026-11-16" });
    expect(result.success).toBe(false);
  });

  it("rejects date ranges exceeding 366 days", () => {
    const result = reportRangeSchema.safeParse({ from: "2025-01-01", to: "2026-01-05" });
    expect(result.success).toBe(false);
  });

  it("rejects malformed date strings", () => {
    expect(reportRangeSchema.safeParse({ from: "invalid", to: "2026-11-16" }).success).toBe(false);
    expect(reportRangeSchema.safeParse({ from: "2026-11-16", to: "invalid" }).success).toBe(false);
  });
});
