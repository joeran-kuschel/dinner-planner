import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { ACCESS_COOKIE, nowSeconds, signSession } from "./lib/access";
import { e2eWorkers } from "./tests/e2e/support/workers";

loadEnv({ quiet: true });

// `npm run check` builds the app once, next to the other stages, and sets E2E_PREBUILT=1 for Playwright: the global setup then
// uses that build instead of making its own (a minute or more). Alone (`npm run test:e2e`) there is no flag, so it builds.
// Every worker runs its own server on its own schema of the development database (tests/e2e/support/test.ts), so the tests
// never see or change the `public` data, and they run side by side; each test empties its worker's schema first.
// Workers: E2E_WORKERS, else a third of the cores, 4 at most (tests/e2e/support/workers.ts).

/**
 * The access key of the test server (lib/access.ts). Only the test server gets it, and every browser context starts
 * with the cookie it makes (`use.storageState` below, which Playwright also applies to `browser.newContext()`), so
 * the whole suite runs through the gate; `access.spec.ts` overrides it with an empty storage state. tests/infra/access.test.ts checks that no manifest or example file has a key.
 */
export const E2E_ACCESS_KEY = "e2e-access-key-0123456789abcdef";

/** A browser's storage with a valid access cookie in it. `access.spec.ts` replaces it with an empty one. */
export const E2E_ACCESS_STATE = {
  cookies: [
    {
      name: ACCESS_COOKIE,
      value: signSession(E2E_ACCESS_KEY, nowSeconds()),
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Files run side by side, the tests of one file one after another.
  fullyParallel: false,
  workers: e2eWorkers(),
  globalSetup: "./tests/e2e/support/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    storageState: E2E_ACCESS_STATE,
    trace: "retain-on-failure",
    timezoneId: "Europe/Berlin",
    // The browser asks for English, so the app starts in English whatever the
    // machine's language; language.spec.ts covers German and the switch.
    locale: "en-GB",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
