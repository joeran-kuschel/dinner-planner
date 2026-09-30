import { execFileSync } from "node:child_process";

/**
 * Vitest global setup: compile the translation catalogs, which are generated
 * and not checked in, so a single test file can run on a fresh checkout.
 * `npm run check` has compiled them already and sets CHECK_CATALOGS_COMPILED, so this
 * does not rewrite the files while the typecheck reads them.
 */
export default function compileCatalogs() {
  if (process.env.CHECK_CATALOGS_COMPILED) return;
  // One process: Lingui's worker threads crash when started from Vitest.
  execFileSync("npx", ["lingui", "compile", "--strict", "--typescript", "--workers", "1"], { stdio: "pipe" });
}
