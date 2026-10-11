import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiError } from "../api-response";

const uuid = z.uuid();
const guestClaims = z.strictObject({
  kind: z.literal("guest"), tableId: uuid,
  cycleNumber: z.number().int().min(0), customerName: z.string().min(1).max(120),
  exp: z.number().int(),
});
const orderClaims = z.strictObject({
  kind: z.literal("order"), orderId: uuid, tableId: uuid, exp: z.number().int(),
});
type GuestClaims = z.infer<typeof guestClaims>;
type OrderClaims = z.infer<typeof orderClaims>;

function secret() {
  const value = process.env.CUSTOMER_TOKEN_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error("CUSTOMER_TOKEN_SECRET must contain at least 32 bytes");
  }
  return value;
}

function sign(claims: GuestClaims | OrderClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verify<T extends GuestClaims | OrderClaims>(token: string, schema: z.ZodType<T>): T | null {
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  if (!timingSafeEqual(Buffer.from(signature, "base64url"), expected)) return null;
  try {
    const claims = schema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return claims.success && claims.data.exp > Math.floor(Date.now() / 1000) ? claims.data : null;
  } catch {
    return null;
  }
}

function bearer(request: Request) {
  return /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
}

export function issueGuestToken(tableId: string, cycleNumber: number, customerName: string) {
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  return { guestToken: sign({ kind: "guest", tableId, cycleNumber, customerName, exp }), expiresAt: new Date(exp * 1000).toISOString() };
}

export function issueOrderViewToken(orderId: string, tableId: string) {
  return sign({ kind: "order", orderId, tableId, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 });
}

export function requireGuest(request: Request): GuestClaims | Response {
  const token = bearer(request);
  return (token && verify(token, guestClaims)) || apiError(401, "INVALID_GUEST_TOKEN", "Enter your name again");
}

export function requireOrderView(request: Request): OrderClaims | Response {
  const token = bearer(request);
  return (token && verify(token, orderClaims)) || apiError(401, "INVALID_ORDER_TOKEN", "Order access token required");
}
