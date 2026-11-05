import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Skip the local server when pointing at a deployed URL.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
