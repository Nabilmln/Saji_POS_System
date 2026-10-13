import { expect, it } from "vitest";
import { apiPage } from "./api-response";
import { LIST_PAGE_SIZE } from "./pagination";

it("limits visible rows to 25 and detects the exact last page", async () => {
  const rows = Array.from({ length: 26 }, (_, id) => ({ id }));
  const first = await apiPage(rows, 1, LIST_PAGE_SIZE).json();
  expect(first.data).toHaveLength(25);
  expect(first.pagination.hasNext).toBe(true);
  const last = await apiPage(rows.slice(0, 25), 2, LIST_PAGE_SIZE).json();
  expect(last.data).toHaveLength(25);
  expect(last.pagination.hasNext).toBe(false);
});
