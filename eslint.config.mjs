import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Other Claude Code sessions' git worktrees, each a full checkout with its own build.
    ".claude/**",
    // Generated, not authored: the Prisma client and the artifacts Playwright
    // writes after a run.
    "generated/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
