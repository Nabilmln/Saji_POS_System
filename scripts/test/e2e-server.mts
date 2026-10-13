import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.pathname !== "/saji_e2e") {
  throw new Error("Browser tests require the dedicated local saji_e2e database");
}
const setupUrl = new URL(url); setupUrl.pathname = "/postgres";
const setup = new Pool({ connectionString: setupUrl.href });
if (!(await setup.query("SELECT 1 FROM pg_database WHERE datname = 'saji_e2e'")).rowCount) await setup.query('CREATE DATABASE "saji_e2e"');
await setup.end();
const pool = new Pool({ connectionString: databaseUrl });
await pool.query(await readFile("scripts/db/local-auth-stub.sql", "utf8"));
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.query("INSERT INTO store_settings (id) VALUES (1) ON CONFLICT DO NOTHING");
const adminId = "00000000-0000-4000-8000-000000000001";
const cashierId = "00000000-0000-4000-8000-000000000002";
await pool.query("INSERT INTO staff_profiles (user_id, display_name, role) VALUES ($1, 'Test Admin', 'ADMIN'), ($2, 'Test Kasir', 'CASHIER') ON CONFLICT (user_id) DO UPDATE SET is_active = true, role = excluded.role", [adminId, cashierId]);
const users = new Map([
  ["admin@example.test", { id: adminId, email: "admin@example.test", name: "Test Admin", role: "admin" }],
  ["cashier@example.test", { id: cashierId, email: "cashier@example.test", name: "Test Kasir", role: "user" }],
]);
const sessions = new Map<string, string>();
const passwords = new Map([...users.keys()].map((email) => [email, "e2e-only-password"]));
const cookieName = "__Secure-neon-auth.session_token";

// Provider fixture is bound to loopback; application authorization and SQL stay real.
const authServer = createServer(async (request, response) => {
  try {
    const path = new URL(request.url!, "http://127.0.0.1:3101").pathname;
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const token = request.headers.cookie?.match(/__Secure-neon-auth\.session_token=([^;]+)/)?.[1];
    const userId = token ? sessions.get(token) : undefined;
    const user = [...users.values()].find((entry) => entry.id === userId);
    const send = (data: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(data)); };
    if (path === "/get-session") {
      send(user ? { user: { ...user, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }, session: { id: randomUUID(), token, userId, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date() } } : null);
    } else if (path === "/sign-in/email") {
      const signedIn = users.get(body.email);
      if (!signedIn || body.password !== passwords.get(body.email)) { send({ message: "Invalid credentials" }, 401); return; }
      const sessionToken = randomUUID(); sessions.set(sessionToken, signedIn.id);
      response.setHeader("Set-Cookie", `${cookieName}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      send({ user: signedIn, token: sessionToken, redirect: false });
    } else if (path === "/sign-out") {
      if (token) sessions.delete(token);
      response.setHeader("Set-Cookie", `${cookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`); send({ success: true });
    } else if (path === "/admin/create-user" && user?.id === adminId) {
      if (users.has(body.email)) { send({ message: "Email already exists" }, 422); return; }
      const created = { id: randomUUID(), name: body.name, email: body.email, role: "user" };
      await pool.query('INSERT INTO neon_auth."user" (id) VALUES ($1)', [created.id]); users.set(created.email, created); passwords.set(created.email, body.password); send({ user: created });
    } else if (path === "/request-password-reset") {
      send({ status: true, message: "Test provider accepted password setup request" });
    } else if (path === "/reset-password" && body.token === "e2e-reset-token" && body.newPassword?.length >= 8) {
      send({ status: true });
    } else if (path === "/admin/remove-user" && user?.id === adminId) {
      const target = [...users.values()].find((entry) => entry.id === body.userId);
      if (target) { users.delete(target.email); passwords.delete(target.email); await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [target.id]); } send({ success: true });
    } else { send({ message: "Unsupported fixture endpoint" }, 403); }
  } catch { response.writeHead(500); response.end(); }
});
await new Promise<void>((resolve) => authServer.listen(3101, "127.0.0.1", resolve));
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl, NEON_AUTH_BASE_URL: "http://127.0.0.1:3101", NEON_AUTH_COOKIE_SECRET: "local-browser-test-cookie-secret-at-least-32-chars", CUSTOMER_TOKEN_SECRET: "local-browser-test-customer-secret-at-least-32-chars" },
});
const stop = () => { app.kill(); authServer.close(); void pool.end(); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
app.on("exit", (code) => { authServer.close(); void pool.end(); process.exitCode = code ?? 0; });
