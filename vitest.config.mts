import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects: server code (lib helpers, server actions) runs in Node against
// a throwaway Postgres schema per test file (see test/setup-server.ts); client components run in jsdom. End-to-end
// tests live in e2e/ and run with Playwright, not Vitest.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    // A time zone that is not UTC and has daylight saving time, so tests catch
    // code that builds planner days from local time instead of UTC midnight.
    env: { TZ: "Europe/Berlin" },
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["lib/**/*.test.ts", "app/**/*.test.ts", "prisma/**/*.test.ts", "test/**/*.test.ts"],
          setupFiles: ["test/setup-server.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["components/**/*.test.tsx", "app/**/*.test.tsx"],
          setupFiles: ["test/setup-dom.ts"],
        },
      },
    ],
  },
});
