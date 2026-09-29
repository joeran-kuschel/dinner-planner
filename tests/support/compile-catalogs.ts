import { execFileSync } from "node:child_process";

/**
 * Vitest global setup: compile the translation catalogs, which are generated
 * and not checked in, so a single test file can run on a fresh checkout.
 */
export default function compileCatalogs() {
  // One process: Lingui's worker threads crash when started from Vitest.
  execFileSync("npx", ["lingui", "compile", "--strict", "--typescript", "--workers", "1"], { stdio: "pipe" });
}
