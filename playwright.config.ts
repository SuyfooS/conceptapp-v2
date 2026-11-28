import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a production build and a local Supabase
// (`pnpm db:start` is not enough: sign-in needs the auth server, so run
// `pnpm exec supabase start`). CI runs them in the `e2e` jobs, and the first
// day in `e2e (first day)`.
const port = 3100;

/**
 * A worker's first day (closing the pilot, PR 27): the one spec the two
 * projects at the end run, and the three sizes never do, so CI grows by one
 * spec and none of the six shards waits for it.
 */
export const FIRST_DAY_SPEC = /(^|[\\/])first-day\.spec\.ts$/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Pages at rest: an accessibility check mid-fade would read colours wrong.
    contextOptions: { reducedMotion: "reduce" },
    locale: "he-IL",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    {
      name: "phone",
      testIgnore: FIRST_DAY_SPEC,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet",
      testIgnore: FIRST_DAY_SPEC,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 },
      },
    },
    {
      name: "desktop",
      testIgnore: FIRST_DAY_SPEC,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    // The first day in another engine: WebKit, as an iPhone 14 draws it
    // (390 wide, 664 high under Safari's bars). Linux WebKit, not a real
    // iPhone: no iOS keyboard, home-screen app or push. The descriptor's
    // user agent says iOS 16.0, under the 16.4 the app reads from it for
    // notifications (`iosVersion` in @domain/push), so it gets an iPhone
    // 15's, a current iOS. Never the Chromium a local run points at. Locally
    // it needs `pnpm exec playwright install webkit` once.
    {
      name: "webkit-390",
      testMatch: FIRST_DAY_SPEC,
      use: {
        ...devices["iPhone 14"],
        browserName: "webkit",
        userAgent: devices["iPhone 15"].userAgent,
        launchOptions: {},
        screenshot: "only-on-failure",
      },
    },
    // And narrower: Android with its largest display size and font draws
    // the page about 300 to 320px wide. The phone project's Pixel 7 at 320,
    // its height in proportion (839 × 320 / 412).
    {
      name: "chromium-320",
      testMatch: FIRST_DAY_SPEC,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 320, height: 652 },
        screenshot: "only-on-failure",
      },
    },
  ],
  webServer: {
    command: `pnpm exec next start --port ${port}`,
    url: `http://127.0.0.1:${port}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
