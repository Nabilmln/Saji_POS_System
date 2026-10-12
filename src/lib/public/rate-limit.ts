import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiError } from "@/lib/api-response";

export async function limitPublicRequests(tableId: string, scope: "guest" | "order") {
  const maximum = scope === "guest" ? 30 : 20;
  // shortcut: A shared table limit can affect guests during abuse; use trusted edge identity if this becomes frequent.
  const result = await db.execute(sql`
    INSERT INTO public_rate_limits (scope, table_id, window_started_at, request_count)
    VALUES (${scope}, ${tableId}, now(), 1)
    ON CONFLICT (scope, table_id) DO UPDATE SET
      window_started_at = CASE
        WHEN public_rate_limits.window_started_at <= now() - interval '1 minute' THEN now()
        ELSE public_rate_limits.window_started_at END,
      request_count = CASE
        WHEN public_rate_limits.window_started_at <= now() - interval '1 minute' THEN 1
        ELSE least(public_rate_limits.request_count + 1, ${maximum + 1}) END
    RETURNING request_count
  `);
  if (Number(result.rows[0].request_count) <= maximum) return null;
  const response = apiError(429, "RATE_LIMITED", "Too many requests for this table; retry shortly");
  response.headers.set("Retry-After", "60");
  return response;
}
