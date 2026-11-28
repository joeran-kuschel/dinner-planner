import os from "node:os";

/** The most workers the suite starts on its own: each one is a browser plus a server of the app, and the tests are timing-sensitive. */
export const MAX_DEFAULT_WORKERS = 4;

/**
 * How many workers Playwright runs: `E2E_WORKERS` when it names a whole number of 1 or more, otherwise a third of the
 * cores (a worker's browser and server need about that), at least 1 and at most `MAX_DEFAULT_WORKERS`.
 * A value that is no such number is an error, not a silent fallback: `E2E_WORKERS=0` or `E2E_WORKERS=two` is a typo.
 */
export function e2eWorkers(env: Record<string, string | undefined> = process.env, cores = os.availableParallelism()): number {
  const asked = env.E2E_WORKERS;
  if (asked !== undefined && asked !== "") {
    if (!/^[1-9][0-9]*$/.test(asked)) throw new Error(`E2E_WORKERS must be a whole number of 1 or more, not ${JSON.stringify(asked)}.`);
    return Number(asked);
  }
  return Math.min(MAX_DEFAULT_WORKERS, Math.max(1, Math.floor(cores / 3)));
}
