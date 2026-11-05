import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const STICKER_PORT = 4100;
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Skip the local servers when pointing at a deployed URL. Locally, stickers come from ../everybird-stickers
  // through scripts/dev/serve-stickers.mjs (the Pages site stands in for it in production).
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: `node scripts/dev/serve-stickers.mjs`,
          url: `http://127.0.0.1:${STICKER_PORT}/`,
          env: { PORT: String(STICKER_PORT) },
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: `npx next dev -p ${PORT}`,
          url: baseURL,
          env: { NEXT_PUBLIC_STICKER_BASE: `http://127.0.0.1:${STICKER_PORT}` },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
