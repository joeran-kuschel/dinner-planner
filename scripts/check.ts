/**
 * The pre-push/pre-merge check: typecheck, lint and the Vitest suite together, then
 * Playwright, each with a time limit and none retried. Prints one table with a time
 * per stage and exits non-zero unless every stage passed.
 *
 * Run with: npm run check   (see documentation/backend/testing-check.md)
 */
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PHASES,
  SLOW_INFRA_TESTS,
  TOTAL_LIMIT_MS,
  canSkipSlowInfra,
  changedFiles,
  databaseReachable,
  exitCode,
  formatReport,
  publishToGitHub,
  runCheck,
  stopAllStages,
  withoutSlowInfra,
} from "./check-lib";

async function main() {
  loadEnv({ quiet: true });
  const started = Date.now();

  // The stages run in process groups of their own, so they do not get a Ctrl+C: stop them here.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => void stopAllStages().then(() => process.exit(1)));
  }

  if (!(await databaseReachable(process.env.DATABASE_URL))) {
    console.error("Check not run: the database does not answer. Start it with `npm run db:up`.");
    process.exit(1);
  }

  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinner-planner-check-"));
  // The slow infra tests guard files that rarely change: they run when one of those did (and always on a push to main).
  const skipSlow = canSkipSlowInfra(changedFiles());
  if (skipSlow) {
    console.log(`vitest: ${SLOW_INFRA_TESTS.length} slow infra test files left out, since nothing they guard changed (k8s/, scripts/, .github/, Dockerfile, tests/infra, tests/support …)`);
  }
  const results = await runCheck(skipSlow ? withoutSlowInfra(PHASES) : PHASES, { totalLimitMs: TOTAL_LIMIT_MS, logDir });
  const totalSeconds = (Date.now() - started) / 1000;
  console.log(formatReport(results, totalSeconds));
  publishToGitHub(results, totalSeconds);
  process.exit(exitCode(results));
}

void main();
