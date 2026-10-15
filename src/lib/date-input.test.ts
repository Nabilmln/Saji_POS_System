import { expect, it } from "vitest";
import { calendarDate, formatDateInput, parseDateInput, shiftCalendarMonth } from "./date-input";

it("accepts real civil dates in displayed EN/ID, numeric and ISO formats", () => {
  for (const text of ["2028-02-29", "29/02/2028", "29 Feb 2028", "29 February 2028"]) expect(parseDateInput(text, "en")).toBe("2028-02-29");
  expect(parseDateInput("15 Oktober 2026", "id")).toBe("2026-10-15");
  expect(parseDateInput("15 Okt 2026", "id")).toBe("2026-10-15");
  expect(parseDateInput("01/01/0001", "en")).toBe("0001-01-01");
  expect(parseDateInput(formatDateInput("0001-01-01", "en"), "en")).toBe("0001-01-01");
  expect(parseDateInput("", "en")).toBe("");
  for (const text of ["29 Feb 2026", "31/04/2026", "2026-13-01", "0000-01-01", "15 unknown 2026", "2026-10-15junk"]) expect(parseDateInput(text, "en")).toBeNull();
});

it("keeps reservation date/time as WIB wall-clock text without a timezone conversion", () => {
  expect(parseDateInput("15 Okt 2026, 19:30", "id", "datetime-local")).toBe("2026-10-15T19:30");
  expect(parseDateInput("2026-10-15T00:00", "en", "datetime-local")).toBe("2026-10-15T00:00");
  for (const text of ["15 Oct 2026", "15 Oct 2026, 24:00", "15 Oct 2026, 19:60"]) expect(parseDateInput(text, "en", "datetime-local")).toBeNull();
  expect(formatDateInput("2026-10-15", "en")).toBe("15 Oct 2026");
  expect(formatDateInput("2026-10-15T19:30", "id", "datetime-local")).toBe("15 Okt 2026, 19:30");
});

it("clamps month/year keyboard navigation at month ends and supported year boundaries", () => {
  expect(shiftCalendarMonth(calendarDate(2028, 0, 31), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  expect(shiftCalendarMonth(calendarDate(2028, 1, 29), 12).toISOString().slice(0, 10)).toBe("2029-02-28");
  expect(shiftCalendarMonth(calendarDate(1, 0, 1), -1).toISOString().slice(0, 10)).toBe("0001-01-01");
  expect(shiftCalendarMonth(calendarDate(9999, 11, 31), 1).toISOString().slice(0, 10)).toBe("9999-12-31");
});
