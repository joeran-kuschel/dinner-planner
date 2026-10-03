import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

const PORT = 3100;

// The end-to-end server gets its own schema in the development database,
// created fresh from the migrations on every run (tests/e2e/support/prepare-db.ts), so tests
// never see or change the `public` data. Tests run one after another on that schema, and it is
// emptied before every test (tests/e2e/support/test.ts), so they cannot affect each other. That is
// why `workers` stays 1: with several, one worker's reset would empty another's data.
export const E2E_SCHEMA = "e2e";

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
      "npm run build",
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
      // The recipe import refuses private addresses; its sample website here runs on this machine.
      // Only the test server gets this (tests/infra/recipe-import.test.ts checks no deployment does).
      RECIPE_IMPORT_ALLOW_PRIVATE: "1",
    },
    // Never reuse a server someone else started: it could use the real database.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
