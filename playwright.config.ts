import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure", browserName: "chromium" },
  webServer: {
    command: "npx tsx scripts/test/e2e-server.mts",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 90_000,
    env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/saji_e2e" },
  },
});
