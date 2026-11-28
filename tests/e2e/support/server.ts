import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { E2E_ACCESS_KEY } from "../../../playwright.config";

/** The first worker's port; worker `i` listens on `E2E_BASE_PORT + i`. */
export const E2E_BASE_PORT = 3100;

/** The schema worker `i` works in: one per worker, so a reset in one never empties another's data. */
export const e2eSchema = (index: number) => `e2e_${index}`;

/** The address of worker `i`'s server. */
export const e2eUrl = (index: number) => `http://localhost:${E2E_BASE_PORT + index}`;

/**
 * Throws when something already listens on the port. Playwright's own `webServer` refused to reuse a server someone else
 * started ("it could use the real database"); the readiness poll below would take a foreign server's answer for ours.
 */
export async function assertPortFree(port: number): Promise<void> {
  // `localhost` can be 127.0.0.1 or ::1, and a foreign server on either would answer the readiness poll: look at both. A machine
  // without IPv6 refuses the second address for another reason (EADDRNOTAVAIL), which is no busy port.
  for (const host of ["127.0.0.1", "::1"]) {
    await new Promise<void>((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", (error: NodeJS.ErrnoException) =>
        error.code === "EADDRINUSE"
          ? reject(new Error(`Port ${port} is in use: another server (maybe \`next dev\`, a test run that did not stop, see \`lsof -i :${port}\`) is running. Stop it first.`))
          : resolve(),
      );
      probe.listen(port, host, () => probe.close(() => resolve()));
    });
  }
}

export type E2EServer = { url: string; schema: string; stop: () => Promise<void> };

/**
 * Starts the standalone server (laid out by global-setup.ts) for worker `index`, on its own port and against `databaseUrl`
 * (which names the worker's schema), and returns once `/healthz` answers. The same server the Docker image runs.
 */
export async function startServer(index: number, databaseUrl: string): Promise<E2EServer> {
  const port = E2E_BASE_PORT + index;
  await assertPortFree(port);

  const child: ChildProcess = spawn("node", [".next/standalone/server.js"], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TZ: "Europe/Berlin",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "localhost",
      ACCESS_KEY: E2E_ACCESS_KEY,
      // The recipe import refuses private addresses; its sample website here runs on this machine.
      // Only the test server gets this (tests/infra/recipe-import.test.ts checks no deployment does).
      RECIPE_IMPORT_ALLOW_PRIVATE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk) => (output = (output + chunk).slice(-4000)));
  let exited = false;
  child.once("exit", () => (exited = true));
  // A worker that is killed without its teardown (out of memory, a hang) would leave the server running on its port and
  // writing to its schema: the server goes with the process that started it.
  const killWithMe = () => child.kill("SIGKILL");
  process.once("exit", killWithMe);
  const spawnFailed = new Promise<never>((_, reject) => child.once("error", (error) => reject(new Error(`The server for worker ${index} did not start: ${error.message}`))));
  spawnFailed.catch(() => {});

  const stop = async () => {
    process.off("exit", killWithMe);
    if (exited) return;
    const gone = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await gone;
    clearTimeout(timer);
  };

  const url = e2eUrl(index);
  const deadline = Date.now() + 60_000;
  let lastAnswer = "none";
  for (;;) {
    if (child.pid === undefined) await spawnFailed;
    if (exited) throw new Error(`The server for worker ${index} stopped while starting:\n${output}`);
    // `localhost` is `::1` first in some containers (GitHub's Playwright image), and the server binds what `localhost` is there, but
    // Node's own `fetch` does not fall back from `127.0.0.1` to it. The browser and curl do, so only this poll asks both addresses.
    for (const base of [`http://127.0.0.1:${port}`, `http://[::1]:${port}`]) {
      try {
        // A call that hangs must not hold the loop past the deadline.
        const answer = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3_000) });
        if (answer.ok) return { url, schema: e2eSchema(index), stop };
        lastAnswer = `${base}: status ${answer.status}`;
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
        lastAnswer = `${base}: ${error instanceof Error ? error.message : error}${cause}`;
      }
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`The server for worker ${index} did not answer ${url}/healthz within 60 s, last answer: ${lastAnswer}\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
