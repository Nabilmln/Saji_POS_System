import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { issueGuestToken, issueOrderViewToken, requireGuest, requireOrderView } from "./tokens";

const tableId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const auth = (token: string) => new Request("https://pos.example/api/public", {
  headers: { authorization: `Bearer ${token}` },
});

beforeEach(() => {
  vi.stubEnv("CUSTOMER_TOKEN_SECRET", "unit-test-secret-with-at-least-32-bytes");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("scopes guest and order tokens by purpose and rejects tampering", () => {
  const { guestToken } = issueGuestToken(tableId, 3, "Aulia");
  const orderToken = issueOrderViewToken(orderId, tableId);
  expect(requireGuest(auth(guestToken))).toMatchObject({ tableId, cycleNumber: 3, customerName: "Aulia" });
  expect(requireOrderView(auth(orderToken))).toMatchObject({ orderId, tableId });
  expect(requireGuest(auth(orderToken))).toHaveProperty("status", 401);
  expect(requireOrderView(auth(guestToken))).toHaveProperty("status", 401);
  expect(requireGuest(auth(`${guestToken[0] === "A" ? "B" : "A"}${guestToken.slice(1)}`))).toHaveProperty("status", 401);
});

it("expires guest and order tokens", () => {
  const { guestToken } = issueGuestToken(tableId, 3, "Aulia");
  const orderToken = issueOrderViewToken(orderId, tableId);
  vi.advanceTimersByTime(2 * 60 * 60 * 1000);
  expect(requireGuest(auth(guestToken))).toHaveProperty("status", 401);
  vi.advanceTimersByTime(22 * 60 * 60 * 1000);
  expect(requireOrderView(auth(orderToken))).toHaveProperty("status", 401);
});
