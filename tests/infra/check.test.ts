import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHILD_ENV,
  PHASES,
  TOTAL_LIMIT_MS,
  databaseReachable,
  exitCode,
  formatReport,
  runCheck,
  type Stage,
  type StageResult,
} from "@/scripts/check-lib";

// `npm run check` (scripts/check.ts), run here with small fake stages instead of the real suite.
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-test-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const stage = (name: string, command: string, limitMs = 10_000): Stage => ({ name, command, limitMs });
const run = (phases: Stage[][], totalLimitMs = 30_000) => runCheck(phases, { totalLimitMs, logDir: path.join(dir, "logs") });
const byName = (results: StageResult[], name: string) => results.find((r) => r.name === name)!;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("the real plan", () => {
  it("has the limits of the issue: 2, 2, 3 and 5 minutes per stage, 8 for the whole check", () => {
    const limits = Object.fromEntries(PHASES.flat().map((s) => [s.name, s.limitMs / 60_000]));
    expect(limits).toMatchObject({ typecheck: 2, lint: 2, vitest: 3, playwright: 5 });
    expect(TOTAL_LIMIT_MS).toBe(8 * 60_000);
  });

  it("runs typecheck, lint and Vitest together, after the catalogs are compiled and before Playwright", () => {
    expect(PHASES.map((phase) => phase.map((s) => s.name))).toEqual([["i18n"], ["typecheck", "lint", "vitest"], ["playwright"]]);
  });

  it("stops Playwright at the first failure and gives each test 10 seconds", () => {
    const playwright = PHASES.flat().find((s) => s.name === "playwright")!;
    expect(playwright.command).toContain("--timeout=10000");
    expect(playwright.command).toContain("--max-failures=1");
  });

  it("does not typecheck through `npm run typecheck`, which compiles the catalogs again", () => {
    expect(PHASES.flat().find((s) => s.name === "typecheck")!.command).toBe("npx tsc --noEmit");
  });

  it("is reachable as `npm run check`", () => {
    const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts;
    expect(scripts.check).toBe("tsx scripts/check.ts");
  });

  it("tells Vitest not to compile the catalogs a second time", () => {
    expect(CHILD_ENV).toEqual({ CHECK_CATALOGS_COMPILED: "1" });
  });
});

describe("running the stages", () => {
  it("runs the stages of a phase together", async () => {
    const started = Date.now();
    const results = await run([[stage("a", "sleep 1"), stage("b", "sleep 1")]]);
    expect(results.map((r) => r.status)).toEqual(["passed", "passed"]);
    expect(Date.now() - started).toBeLessThan(1900);
  });

  it("runs the phases one after the other", async () => {
    const order = path.join(dir, "order");
    await run([[stage("a", `sleep 0.3; echo a >> ${order}`)], [stage("b", `echo b >> ${order}`)]]);
    expect(fs.readFileSync(order, "utf8")).toBe("a\nb\n");
  });

  it("fails a stage that exits non-zero and keeps the end of its output", async () => {
    const results = await run([[stage("lint", "seq 1 50; exit 3")]]);
    const [lint] = results;
    expect(lint.status).toBe("failed");
    expect(lint.tail.split("\n")).toHaveLength(20);
    expect(lint.tail.split("\n")[19]).toBe("50");
    expect(fs.readFileSync(lint.logFile!, "utf8").split("\n")[0]).toBe("1");
    expect(exitCode(results)).toBe(1);
  });

  it("skips the later phases once a stage has failed, but lets its own phase finish", async () => {
    const results = await run([[stage("a", "exit 1"), stage("b", "sleep 0.3")], [stage("c", "echo never > " + path.join(dir, "c"))]]);
    expect(byName(results, "a").status).toBe("failed");
    expect(byName(results, "b").status).toBe("passed");
    expect(byName(results, "c")).toMatchObject({ status: "skipped", note: "an earlier stage did not pass" });
    expect(fs.existsSync(path.join(dir, "c"))).toBe(false);
  });

  it("never retries a failing stage", async () => {
    const counter = path.join(dir, "runs");
    await run([[stage("flaky", `echo run >> ${counter}; exit 1`)]]);
    expect(fs.readFileSync(counter, "utf8")).toBe("run\n");
  });

  it("kills a stage at its limit, with everything it started", async () => {
    const pidFile = path.join(dir, "pid");
    const started = Date.now();
    const results = await run([[stage("hang", `sleep 30 & echo $! > ${pidFile}; wait`, 400)]]);
    expect(results[0]).toMatchObject({ status: "timeout", note: "stage limit" });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(alive(Number(fs.readFileSync(pidFile, "utf8")))).toBe(false);
    expect(exitCode(results)).toBe(1);
  });

  it("stops at the whole-check limit even when the stage's own limit is longer", async () => {
    const results = await run([[stage("slow", "sleep 30", 60_000)], [stage("after", "true")]], 400);
    expect(byName(results, "slow")).toMatchObject({ status: "timeout", note: "whole-check limit" });
    expect(byName(results, "after").status).toBe("skipped");
  });

  it("exits 0 only when every stage passed", async () => {
    expect(exitCode(await run([[stage("a", "true")], [stage("b", "true")]]))).toBe(0);
    expect(exitCode(await run([[stage("a", "true")], [stage("b", "false")]]))).toBe(1);
  });

  it("passes CHECK_CATALOGS_COMPILED to its stages", async () => {
    const results = await run([[stage("env", `test "$CHECK_CATALOGS_COMPILED" = 1`)]]);
    expect(results[0].status).toBe("passed");
  });
});

describe("the report", () => {
  it("is a table with a result and the seconds of each stage, and the verdict", async () => {
    const results = await run([[stage("typecheck", "true"), stage("lint", "echo broken; exit 1")], [stage("playwright", "true")]]);
    const report = formatReport(results, 12.34);
    expect(report).toMatch(/^Stage\s+Result\s+Seconds$/m);
    expect(report).toMatch(/^typecheck\s+passed\s+\d/m);
    expect(report).toMatch(/^lint\s+failed\s+\d/m);
    expect(report).toMatch(/^playwright\s+skipped \(an earlier stage did not pass\)\s+0\.0$/m);
    expect(report).toContain("--- lint: last 20 lines");
    expect(report).toContain("broken");
    expect(report).toContain("Check FAILED in 12.3 s");
  });

  it("says passed, and shows no output, when everything passed", async () => {
    const report = formatReport(await run([[stage("a", "echo noise")]]), 1);
    expect(report).toContain("Check passed in 1.0 s");
    expect(report).not.toContain("noise");
  });
});

describe("databaseReachable", () => {
  it("is true when something listens on the URL's port", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as net.AddressInfo;
    try {
      expect(await databaseReachable(`postgresql://u:p@127.0.0.1:${port}/db`)).toBe(true);
    } finally {
      server.close();
    }
  });

  it("is false when nothing listens, without waiting for a timeout", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as net.AddressInfo;
    await new Promise((resolve) => server.close(resolve));
    const started = Date.now();
    expect(await databaseReachable(`postgresql://u:p@127.0.0.1:${port}/db`)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("is false for a missing or malformed URL", async () => {
    expect(await databaseReachable(undefined)).toBe(false);
    expect(await databaseReachable("not a url")).toBe(false);
  });
});

describe("the catalog compile in Vitest's global setup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("node:child_process");
    vi.resetModules();
  });

  it("is skipped when `npm run check` has compiled the catalogs already", async () => {
    const execFileSync = vi.fn();
    vi.resetModules();
    vi.doMock("node:child_process", () => ({ execFileSync }));
    vi.stubEnv("CHECK_CATALOGS_COMPILED", "1");
    const { default: compileCatalogs } = await import("../support/compile-catalogs");
    compileCatalogs();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("still compiles them when a test file runs on its own", async () => {
    const execFileSync = vi.fn();
    vi.resetModules();
    vi.doMock("node:child_process", () => ({ execFileSync }));
    vi.stubEnv("CHECK_CATALOGS_COMPILED", "");
    const { default: compileCatalogs } = await import("../support/compile-catalogs");
    compileCatalogs();
    expect(execFileSync).toHaveBeenCalledWith("npx", expect.arrayContaining(["lingui", "compile"]), expect.anything());
  });
});
