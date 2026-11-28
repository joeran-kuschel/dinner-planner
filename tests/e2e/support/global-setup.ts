import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * Run once by Playwright before any worker starts: lays out the standalone server the way the Docker image does (`public/` and
 * `.next/static` next to `server.js`, see the Dockerfile), building the app first unless `npm run check` already did
 * (`E2E_PREBUILT=1`, which only a build stage sets: alone there is no flag, so it builds). Each worker then starts its own copy
 * of that server on its own schema (tests/e2e/support/test.ts).
 */
export default function globalSetup() {
  if (process.env.E2E_PREBUILT !== "1") execSync("npm run build", { stdio: "inherit" });
  fs.cpSync("public", ".next/standalone/public", { recursive: true });
  fs.cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
}
