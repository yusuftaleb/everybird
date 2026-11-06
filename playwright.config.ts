import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const PERF_PORT = 3200;
const STICKER_PORT = 4100;
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
// The frame-timing test measures a production build (dev-mode React and on-demand compiles add frame time
// that users never see). Pointed at a deployed URL, everything uses BASE_URL.
const perfURL = process.env.BASE_URL ?? `http://localhost:${PERF_PORT}`;
const stickers = { NEXT_PUBLIC_STICKER_BASE: `http://127.0.0.1:${STICKER_PORT}` };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /filters\.spec\.ts/ },
    // The timeline, the share dialog and Settings (page heads, Tick by hand) in Safari's engine too.
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /(timeline|share|settings)\.spec\.ts/ },
    // The frame-timing test runs on its own, after everything else, so other workers can't steal its CPU.
    {
      name: "perf",
      use: { ...devices["Desktop Chrome"], baseURL: perfURL },
      testMatch: /filters\.spec\.ts/,
      dependencies: ["chromium", "webkit"],
    },
  ],
  // Skip the local servers when pointing at a deployed URL. Locally, stickers come from ../everybird-stickers
  // through scripts/dev/serve-stickers.mjs (the Pages site stands in for it in production). The Next servers
  // use their own dist dirs (NEXT_DIST_DIR, next.config.ts), so they run beside a developer's `next dev` or
  // `next start` on this checkout without touching its `.next`.
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
          env: { ...stickers, NEXT_DIST_DIR: ".next-e2e-dev" },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: `npx next build && npx next start -p ${PERF_PORT}`,
          url: perfURL,
          env: { ...stickers, NEXT_DIST_DIR: ".next-e2e" },
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      ],
});
