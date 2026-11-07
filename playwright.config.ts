import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const PERF_PORT = 3200;
const STICKER_PORT = 4100;
// BASE_URL=<deployed site> runs send no analytics: Playwright sets navigator.webdriver, and src/lib/analytics.ts
// (automatedRun) then sends no events and loads no Cloudflare beacon (by hand: open any page with ?noanalytics).
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
// The frame-timing test measures a production build (dev-mode React and on-demand compiles add frame time
// that users never see). Pointed at a deployed URL, everything uses BASE_URL.
const perfURL = process.env.BASE_URL ?? `http://localhost:${PERF_PORT}`;
const stickers = { NEXT_PUBLIC_STICKER_BASE: `http://127.0.0.1:${STICKER_PORT}` };
// Every spec starts with the first-visit welcome already closed (src/lib/welcome.ts), so specs that open "/" fresh see
// the landing as before. e2e/welcome.spec.ts opts out with `test.use({ storageState: { cookies: [], origins: [] } })`.
const welcomed = (url: string) => ({
  cookies: [],
  origins: [{ origin: new URL(url).origin, localStorage: [{ name: "everybird:welcomed", value: "1" }] }],
});

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL, storageState: welcomed(baseURL) },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /(filters|stress)\.spec\.ts/ },
    // The flow matrix (flows.spec.ts: every way in, filters, card, share, backup; each engine samples two widths, MATRIX=full
    // walks all five), the timeline, the share dialog, Settings (page heads, Tick by hand), the top bar's headroom and About
    // (its "How it works" poster and stage) in Safari's engine too.
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /(flows|timeline|share|settings|responsive|dock-sweep|sticker-loading|welcome|headroom|about|text-size|count-hole)\.spec\.ts/ },
    // Gecko: the flow matrix and the specs that drive the dropdowns, the timeline, the share dialog, Settings, About, the
    // shared view and the theme. The first-visit welcome (welcome.spec.ts) runs in Chromium and WebKit.
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: /(flows|timeline|places|share|share-link|settings|about|smoke)\.spec\.ts/,
    },
    // The frame-timing test runs on its own, after everything else, so other workers can't steal its CPU.
    {
      name: "perf",
      use: { ...devices["Desktop Chrome"], baseURL: perfURL, storageState: welcomed(perfURL) },
      testMatch: /filters\.spec\.ts/,
      dependencies: ["chromium", "webkit", "firefox"],
    },
    // Viral-scale stress (3,000 / 6,000 / ~11,000 species, 390 and 1440 px), opt-in: only with STRESS=1
    // (`npm run e2e:stress`), on the production build, one test at a time, in both engines.
    ...(process.env.STRESS
      ? [
          { name: "stress-chromium", use: { ...devices["Desktop Chrome"], baseURL: perfURL, storageState: welcomed(perfURL) }, testMatch: /stress\.spec\.ts/ },
          { name: "stress-webkit", use: { ...devices["Desktop Safari"], baseURL: perfURL, storageState: welcomed(perfURL) }, testMatch: /stress\.spec\.ts/ },
        ]
      : []),
  ],
  // Skip the local servers when pointing at a deployed URL. Locally, stickers come from ../everybird-stickers
  // through scripts/dev/serve-stickers.mjs (production serves them from R2, https://stickers.yusuftaleb.com). The Next servers
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
