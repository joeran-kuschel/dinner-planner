import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export type Stage = { name: string; command: string; limitMs: number };

export type StageResult = {
  name: string;
  status: "passed" | "failed" | "timeout" | "skipped";
  seconds: number;
  /** Why a stage timed out or was skipped. */
  note?: string;
  /** The last lines of its output; kept for stages that did not pass. */
  tail: string;
  logFile?: string;
};

const MINUTE = 60_000;
const TAIL_LINES = 20;
const TAIL_CHARS = 20_000;

/** Stages in a phase run together; a phase starts only when the one before it passed. */
export const PHASES: Stage[][] = [
  [{ name: "i18n", command: "npm run i18n:compile", limitMs: MINUTE }],
  [
    { name: "typecheck", command: "npx tsc --noEmit", limitMs: 2 * MINUTE },
    { name: "lint", command: "npm run lint", limitMs: 2 * MINUTE },
    { name: "vitest", command: "npx vitest run", limitMs: 3 * MINUTE },
  ],
  // A slow test is a failing test: 10 s per test, and stop at the first failure.
  [
    {
      name: "playwright",
      command: "npx playwright test --timeout=10000 --max-failures=1 --reporter=line",
      limitMs: 5 * MINUTE,
    },
  ],
];

export const TOTAL_LIMIT_MS = 8 * MINUTE;

/** The phases run the compile themselves, so Vitest must not start a second one next to the typecheck. */
export const CHILD_ENV = { CHECK_CATALOGS_COMPILED: "1" };

/** How long a stage gets to shut down after SIGINT before everything it started is killed. */
export const KILL_GRACE_MS = 2000;
/** How long the output pipes may stay open after a stage has exited, for a background process that holds them. */
const PIPE_GRACE_MS = 1000;

type Running = { terminate: (reason: "limit" | "interrupt") => void; settled: Promise<void> };
const running = new Set<Running>();

function lastLines(text: string): string {
  return text.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
}

function signalGroup(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

/**
 * Runs one stage, once. At its limit it gets SIGINT, as if Ctrl+C was pressed: Playwright stops
 * the web server it started in a group of its own on SIGINT and on nothing else. After a short
 * grace period everything left in the stage's process group is killed.
 */
export function runStage(stage: Stage, limitMs: number, logDir: string): Promise<StageResult> {
  const started = Date.now();
  const logFile = path.join(logDir, `${stage.name}.log`);
  const log = fs.createWriteStream(logFile);
  let output = "";
  let stopReason: "limit" | "interrupt" | undefined;
  let exitCode: number | null = null;
  let failure: string | undefined;
  let finished = false;
  let markSettled!: () => void;
  const settled = new Promise<void>((resolve) => (markSettled = resolve));
  const timers: NodeJS.Timeout[] = [];

  const result = new Promise<StageResult>((resolve) => {
    const child = spawn("sh", ["-c", stage.command], {
      detached: true,
      env: { ...process.env, ...CHILD_ENV },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk: Buffer) => {
      log.write(chunk);
      output = (output + chunk.toString()).slice(-TAIL_CHARS);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      child.stdout.destroy();
      child.stderr.destroy();
      running.delete(handle);

      let status: StageResult["status"];
      let note: string | undefined;
      if (stopReason === "limit") {
        status = "timeout";
        note = limitMs < stage.limitMs ? "whole-check limit" : "stage limit";
      } else if (stopReason === "interrupt") {
        status = "failed";
        note = "interrupted";
      } else if (failure) {
        status = "failed";
        note = failure;
      } else {
        status = exitCode === 0 ? "passed" : "failed";
      }
      // Resolve once the log is on disk, so the path in the report never points at a cut-off file.
      log.end(() => {
        resolve({
          name: stage.name,
          status,
          note,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          tail: status === "passed" ? "" : lastLines(output),
          logFile,
        });
        markSettled();
      });
    };

    const terminate = (reason: "limit" | "interrupt") => {
      if (stopReason || finished) return;
      stopReason = reason;
      signalGroup(child.pid, "SIGINT");
      timers.push(setTimeout(() => signalGroup(child.pid, "SIGKILL"), KILL_GRACE_MS));
      // If neither the exit nor the close ever arrives, stop waiting for them.
      timers.push(setTimeout(finish, KILL_GRACE_MS + PIPE_GRACE_MS));
    };
    const handle: Running = { terminate, settled };
    running.add(handle);

    timers.push(setTimeout(() => terminate("limit"), limitMs));
    child.on("error", (error) => {
      failure = error.message;
      finish();
    });
    child.on("exit", (code) => {
      exitCode = code;
      // A process the stage left behind must not outlive it, or keep the pipes open.
      signalGroup(child.pid, "SIGKILL");
      timers.push(setTimeout(finish, PIPE_GRACE_MS));
    });
    child.on("close", finish);
  });
  return result;
}

/** Stops every stage that is running (Ctrl+C or a kill of the check), and waits until they are gone. */
export async function stopAllStages(): Promise<void> {
  const handles = [...running];
  handles.forEach((handle) => handle.terminate("interrupt"));
  await Promise.all(handles.map((handle) => handle.settled));
}

/**
 * Runs the phases in order, the stages of a phase together. Nothing is retried, and
 * once a stage has failed the later phases are skipped: the first failure is the one
 * to fix, and waiting for the rest only costs time.
 */
export async function runCheck(
  phases: Stage[][],
  { totalLimitMs, logDir }: { totalLimitMs: number; logDir: string },
): Promise<StageResult[]> {
  fs.mkdirSync(logDir, { recursive: true });
  const deadline = Date.now() + totalLimitMs;
  const results: StageResult[] = [];
  let failed = false;

  for (const phase of phases) {
    const remaining = deadline - Date.now();
    const settled = await Promise.all(
      phase.map((stage): Promise<StageResult> => {
        if (failed || remaining <= 0) {
          const note = failed ? "an earlier stage did not pass" : "whole-check limit";
          return Promise.resolve({ name: stage.name, status: "skipped", seconds: 0, note, tail: "" });
        }
        return runStage(stage, Math.min(stage.limitMs, remaining), logDir);
      }),
    );
    results.push(...settled);
    if (settled.some((result) => result.status === "failed" || result.status === "timeout")) failed = true;
  }
  return results;
}

/** Can something be reached on the database's host and port? Fails fast instead of letting tests hang. */
export function databaseReachable(url: string | undefined, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(url ?? "");
    } catch {
      resolve(false);
      return;
    }
    const socket = net.connect({ host: target.hostname, port: Number(target.port) || 5432 });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
  });
}

export function exitCode(results: StageResult[]): number {
  return results.every((result) => result.status === "passed") ? 0 : 1;
}

export function formatReport(results: StageResult[], totalSeconds: number): string {
  const width = Math.max(...results.map((r) => r.name.length), "Stage".length);
  const rows = results.map((r) => {
    const note = r.note ? ` (${r.note})` : "";
    return `${r.name.padEnd(width)}  ${(r.status + note).padEnd(34)}  ${r.seconds.toFixed(1)}`;
  });
  const lines = [`${"Stage".padEnd(width)}  ${"Result".padEnd(34)}  Seconds`, ...rows];

  for (const r of results.filter((r) => r.tail)) {
    lines.push("", `--- ${r.name}: last ${TAIL_LINES} lines (full log: ${r.logFile})`, r.tail);
  }
  lines.push("", `Check ${exitCode(results) === 0 ? "passed" : "FAILED"} in ${totalSeconds.toFixed(1)} s`);
  return lines.join("\n");
}
