import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { linguiMacro } from "./tests/support/lingui-macro.mjs";

// All test cases live in tests/: unit/ mirrors the source tree, infra/ covers the
// scripts and manifests, e2e/ holds the Playwright specs (not run by Vitest).
// Two projects: server code (lib helpers, server actions) runs in Node against
// a throwaway Postgres schema per test file (see tests/support/setup-server.ts); client
// components (*.test.tsx) run in jsdom.
export default defineConfig({
  plugins: [linguiMacro(), react()],
  resolve: { tsconfigPaths: true },
  test: {
    // A time zone that is not UTC and has daylight saving time, so tests catch
    // code that builds planner days from local time instead of UTC midnight.
    env: { TZ: "Europe/Berlin" },
    restoreMocks: true,
    globalSetup: ["tests/support/compile-catalogs.ts", "tests/support/drop-stale-schemas.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/infra/**/*.test.ts"],
          setupFiles: ["tests/support/setup-server.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/support/setup-dom.ts"],
        },
      },
    ],
  },
});
