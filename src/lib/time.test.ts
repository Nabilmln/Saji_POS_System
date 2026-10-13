import { expect, it } from "vitest";
import { formatDate, formatDateTime, restaurantDate } from "./time";

it("uses named months and the restaurant timezone for date and timestamp displays", () => {
  expect(formatDate("2026-10-12", "en")).toBe("12 Oct 2026");
  expect(formatDate("2026-10-12", "en", "long")).toBe("12 October 2026");
  expect(formatDate("2026-10-12", "id", "long")).toBe("12 Oktober 2026");
  expect(formatDateTime("2026-10-12T18:05:00Z", "en")).toBe("13 Oct 2026 · 01:05 WIB");
  expect(restaurantDate(new Date("2026-10-12T18:05:00Z"))).toBe("2026-10-13");
});
