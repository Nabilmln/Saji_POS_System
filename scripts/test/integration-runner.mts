import { spawn } from "node:child_process";

const env = {
  ...process.env,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/saji_e2e",
  TEST_API_BASE_URL: "http://localhost:3100",
  TEST_ADMIN_EMAIL: "admin@example.test",
  TEST_ADMIN_PASSWORD: "e2e-only-password",
  TEST_CASHIER_EMAIL: "cashier@example.test",
  TEST_CASHIER_PASSWORD: "e2e-only-password",
  CUSTOMER_TOKEN_SECRET: "local-browser-test-customer-secret-at-least-32-chars",
};
let occupied = false;
try { occupied = (await fetch(env.TEST_API_BASE_URL)).ok; } catch { /* No server is listening. */ }
if (occupied) throw new Error("Port 3100 is already occupied; stop the existing server before testing");
const server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/test/e2e-server.mts"], { env, stdio: "inherit", windowsHide: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Local test server exited before readiness");
    try { if ((await fetch(env.TEST_API_BASE_URL)).ok) { ready = true; break; } } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Local test server did not become ready");
  const suite = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src", "--no-file-parallelism"], { env, stdio: "inherit", windowsHide: true });
  process.exitCode = await new Promise<number>((resolve) => suite.on("exit", (code) => resolve(code ?? 1)));
} finally {
  if (process.platform === "win32" && server.pid) {
    const stop = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    await new Promise((resolve) => stop.on("exit", resolve));
  } else server.kill("SIGTERM");
}
