import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// The screenshots in documentation/images: `npm run docs:screenshots`. The same standalone server, on a schema of its own (`e2e_0`), as the
// end-to-end tests (so the real data is never in a picture), but only tests/screenshots, which `npm run check` never runs.
export default defineConfig(base, {
  testDir: "tests/screenshots",
  testMatch: "**/*.shots.ts",
  reporter: [["list"]],
  timeout: 240_000,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "light" } }],
});
