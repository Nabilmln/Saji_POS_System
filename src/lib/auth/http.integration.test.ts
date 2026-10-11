import { Client } from "pg";
import { expect, it } from "vitest";

const dbUrl = process.env.TEST_DATABASE_URL;
const baseUrl = process.env.TEST_API_BASE_URL;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

it.skipIf(!dbUrl || !baseUrl || !email || !password)("rejects cashier and inactive staff through real HTTP auth", async () => {
  const dbHost = new URL(dbUrl!).hostname;
  const appHost = new URL(baseUrl!).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(dbHost) ||
      !["localhost", "127.0.0.1", "::1"].includes(appHost)) {
    throw new Error("Auth HTTP test must use a local app and database");
  }
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(signIn.status).toBe(200);
  const { user } = await signIn.json();
  const cookie = signIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  expect(cookie).not.toBe("");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  let authUserCreated = false;
  let profileCreated = false;
  try {
    const inserted = await client.query('INSERT INTO neon_auth."user" (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [user.id]);
    authUserCreated = inserted.rowCount === 1;
    const profile = await client.query(
      "INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'Auth HTTP test', 'CASHIER') RETURNING user_id", [user.id],
    );
    profileCreated = profile.rowCount === 1;
    const headers = { Cookie: cookie };
    expect((await fetch(`${baseUrl}/api/staff/me`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/admin/me`, { headers })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/admin/settings/billing`, {
      method: "PUT", headers: { ...headers, Origin: baseUrl! },
    })).status).toBe(403);
    await client.query("UPDATE staff_profiles SET is_active = false WHERE user_id = $1", [user.id]);
    expect((await fetch(`${baseUrl}/api/staff/me`, { headers })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/admin/me`, { headers })).status).toBe(403);
  } finally {
    if (profileCreated) await client.query("DELETE FROM staff_profiles WHERE user_id = $1", [user.id]);
    if (authUserCreated) await client.query('DELETE FROM neon_auth."user" WHERE id = $1', [user.id]);
    await client.end();
    const signOut = await fetch(`${baseUrl}/api/auth/sign-out`, {
      method: "POST", headers: { Cookie: cookie, Origin: baseUrl!, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(signOut.status).toBe(200);
  }
}, 30_000);
