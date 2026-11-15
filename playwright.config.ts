import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Cleanup happens here (not in globalSetup) because webServer starts before globalSetup.
    command: "rm -rf .data/e2e && npm run db:migrate && npm run dev",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_DEV_LOGIN: "true",
      AUTH_SECRET: "e2e-secret",
      DATABASE_URL: "pglite:./.data/e2e",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
