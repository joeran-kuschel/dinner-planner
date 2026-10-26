import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { ACCESS_COOKIE, nowSeconds, signSession } from "./lib/access";

loadEnv({ quiet: true });

const PORT = 3100;

// `npm run check` builds the app once, next to the other stages, and sets this for Playwright: the server then starts from
// that build instead of building its own (a minute or more). Alone (`npm run test:e2e`) there is no flag, so it builds.
const PREBUILT = process.env.E2E_PREBUILT === "1";

// The end-to-end server gets its own schema in the development database,
// created fresh from the migrations on every run (tests/e2e/support/prepare-db.ts), so tests
// never see or change the `public` data. Tests run one after another on that schema, and it is
// emptied before every test (tests/e2e/support/test.ts), so they cannot affect each other. That is
// why `workers` stays 1: with several, one worker's reset would empty another's data.
export const E2E_SCHEMA = "e2e";

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

/** The development database, pointed at the end-to-end schema. */
function e2eDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set. Start the database with `npm run db:up`.");
  const url = new URL(base);
  url.searchParams.set("schema", E2E_SCHEMA);
  return url.toString();
}

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: E2E_ACCESS_STATE,
    trace: "retain-on-failure",
    timezoneId: "Europe/Berlin",
    // The browser asks for English, so the app starts in English whatever the
    // machine's language; language.spec.ts covers German and the switch.
    locale: "en-GB",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The same standalone server the Docker image runs, laid out the same way:
    // server.js with `public/` and `.next/static` copied next to it (see the
    // Dockerfile). Its build output is separate from `next dev`, which keeps
    // running undisturbed.
    command: [
      "npx tsx tests/e2e/support/prepare-db.ts",
      ...(PREBUILT ? [] : ["npm run build"]),
      "cp -R public .next/standalone/",
      "cp -R .next/static .next/standalone/.next/",
      "node .next/standalone/server.js",
    ].join(" && "),
    url: `http://localhost:${PORT}`,
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      TZ: "Europe/Berlin",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "localhost",
      ACCESS_KEY: E2E_ACCESS_KEY,
      // The recipe import refuses private addresses; its sample website here runs on this machine.
      // Only the test server gets this (tests/infra/recipe-import.test.ts checks no deployment does).
      RECIPE_IMPORT_ALLOW_PRIVATE: "1",
    },
    // Never reuse a server someone else started: it could use the real database.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
