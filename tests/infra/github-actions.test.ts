import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW = path.join(process.cwd(), ".github/workflows/check.yml");

// Parsed YAML; each test reads only the fields it checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workflow: any = parse(fs.readFileSync(WORKFLOW, "utf-8"));
const steps: { uses?: string; run?: string; with?: Record<string, unknown> }[] = workflow.jobs.check.steps;

describe("the GitHub Actions check", () => {
  it("runs on pull requests and on pushes to main", () => {
    expect(workflow.on).toHaveProperty("pull_request");
    expect(workflow.on.push.branches).toEqual(["main"]);
  });

  it("runs the same `npm run check` as the developer's machine, after generating the Prisma client and the route types", () => {
    const runs = steps.map((step) => step.run);
    expect(runs).toContain("npm run check");
    for (const generate of ["npm run db:generate", "npx next typegen"]) {
      expect(runs.indexOf(generate)).toBeGreaterThan(runs.indexOf("npm ci"));
      expect(runs.indexOf(generate)).toBeLessThan(runs.indexOf("npm run check"));
    }
  });

  it("gets a read-only token and no secrets, and never runs fork code with write access", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on).not.toHaveProperty("pull_request_target");
    expect(fs.readFileSync(WORKFLOW, "utf-8")).not.toContain("secrets.");
  });

  it("pins every action to a commit, keeps Dependabot watching them and leaves the token out of the checkout", () => {
    for (const step of steps.filter((step) => step.uses)) expect(step.uses).toMatch(/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);

    const dependabot = parse(fs.readFileSync(path.join(process.cwd(), ".github/dependabot.yml"), "utf-8"));
    expect(dependabot.updates.map((update: { "package-ecosystem": string }) => update["package-ecosystem"])).toContain(
      "github-actions",
    );

    const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
  });

  it("does not cancel runs on main", () => {
    expect(workflow.concurrency["cancel-in-progress"]).toContain("pull_request");
  });

  it("uses the database of compose.yaml and the URL of .env.example, with a password of its own", () => {
    const compose = parse(fs.readFileSync(path.join(process.cwd(), "compose.yaml"), "utf-8")).services.db;
    const service = workflow.jobs.check.services.postgres;
    expect(service.image).toBe(compose.image);
    expect(service.ports).toEqual(compose.ports);
    expect(service.env.POSTGRES_USER).toBe(compose.environment.POSTGRES_USER);
    expect(service.env.POSTGRES_DB).toBe(compose.environment.POSTGRES_DB);

    // compose.yaml reads its password from .env, which the runner does not have: the job's is a throwaway.
    const url = new URL(workflow.jobs.check.env.DATABASE_URL);
    expect(url.password).toBe(service.env.POSTGRES_PASSWORD);
    expect(url.password).not.toBe(compose.environment.POSTGRES_PASSWORD);

    const example = new URL(/^DATABASE_URL="(.+)"$/m.exec(fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf-8"))![1]);
    expect([url.username, url.host, url.pathname, url.search]).toEqual([example.username, example.host, example.pathname, example.search]);
  });

  it("uses the Node version of the Docker image and installs the browser Playwright needs", () => {
    const node = steps.find((step) => step.uses?.startsWith("actions/setup-node"));
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf-8");
    expect(dockerfile).toContain(`FROM node:${node?.with?.["node-version"]}-alpine AS app`);
    expect(install?.run).toContain("npx playwright install --with-deps chromium");
  });

  // The step that installs the browser and its libraries.
  const install = steps.find((step) => step.run?.includes("playwright install"));

  it("installs the browser before the check, with a time limit per attempt, a few attempts and a limit for the step", () => {
    expect(steps.indexOf(install!)).toBeGreaterThan(steps.findIndex((step) => step.run === "npx next typegen"));
    expect(steps.indexOf(install!)).toBeLessThan(steps.findIndex((step) => step.run === "npm run check"));
    // `timeout` stops an attempt that hangs (a slow mirror once took 11 minutes), and the loop tries again.
    expect(install?.run).toMatch(/for attempt in 1 2 3/);
    expect(install?.run).toMatch(/timeout --kill-after=\d+ 120 npx playwright install --with-deps chromium/);
    expect(install?.run).toContain("exit 1");
    expect((install as { "timeout-minutes"?: number })["timeout-minutes"]).toBeLessThanOrEqual(10);
    // The last attempt failing fails the step: it must not carry on without a browser.
    expect(install?.run?.trim().endsWith("exit 1")).toBe(true);
  });

  describe("the install step's script", () => {
    /** Runs the step's script with a fake `timeout` that fails the first `failures` attempts (exit 124, like a timeout). */
    function runInstall(failures: number) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "install-step-"));
      try {
        const fake = (name: string, body: string) => {
          fs.writeFileSync(path.join(dir, name), `#!/bin/bash\n${body}\n`);
          fs.chmodSync(path.join(dir, name), 0o755);
        };
        // The install attempts are `timeout --kill-after=10 120 npx …` and fail (exit 124, as a timeout) the first
        // `failures` times; the cleanup `timeout 30 sudo …` only runs the command, which is the fake `sudo`.
        fake(
          "timeout",
          `echo "timeout $*" >> "${dir}/calls"\nif [ "$1" = "30" ]; then shift; exec "$@"; fi\nn=$(grep -c '^timeout --kill-after' "${dir}/calls")\n[ "$n" -le ${failures} ] && exit 124\nexit 0`,
        );
        fake("sudo", `echo "sudo $*" >> "${dir}/calls"`);
        fake("sleep", "exit 0");
        const result = spawnSync("bash", ["-e", "-c", install!.run!], {
          encoding: "utf8",
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
        });
        return { ...result, calls: fs.readFileSync(path.join(dir, "calls"), "utf8").split("\n").filter(Boolean) };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("is done after one attempt when the install works", () => {
      const result = runInstall(0);
      expect(result.status).toBe(0);
      expect(result.calls).toEqual(["timeout --kill-after=10 120 npx playwright install --with-deps chromium"]);
    });

    it("tries again after an attempt that timed out, and cleans up what apt left", () => {
      const result = runInstall(2);
      expect(result.status).toBe(0);
      expect(result.calls.filter((call) => call.startsWith("timeout --kill-after"))).toHaveLength(3);
      // Each cleanup has its own time limit.
      expect(result.calls.filter((call) => call === "timeout 30 sudo dpkg --configure -a")).toHaveLength(2);
      expect(result.stdout).toContain("::warning::Installing the browser did not finish within 120 seconds, or failed (attempt 1 of 3).");
    });

    it("stops the root apt that `timeout` cannot reach before it tries again, since it would keep the dpkg lock", () => {
      const result = runInstall(1);
      expect(result.status).toBe(0);
      const killed = result.calls.filter((call) => call.startsWith("sudo pkill"));
      expect(killed).toEqual(["apt-get", "apt", "dpkg", "http", "https"].map((name) => `sudo pkill -KILL -x ${name}`));
      // Before the next attempt, and before dpkg is asked to finish: a lock held by a live process cannot be repaired.
      const timeouts = result.calls.map((call, index) => [call, index] as const).filter(([call]) => call.startsWith("timeout --kill-after"));
      const configure = result.calls.indexOf("timeout 30 sudo dpkg --configure -a");
      const lastKill = result.calls.lastIndexOf("sudo pkill -KILL -x https");
      expect(timeouts[0][1]).toBeLessThan(result.calls.indexOf("sudo pkill -KILL -x apt-get"));
      expect(lastKill).toBeLessThan(configure);
      expect(configure).toBeLessThan(timeouts[1][1]);
    });

    it("never removes a lock file", () => {
      expect(install?.run).not.toMatch(/rm\s+.*lock/);
    });

    it("fails the step after the third failed attempt, so the check does not run without a browser", () => {
      const result = runInstall(3);
      expect(result.status).toBe(1);
      expect(result.calls.filter((call) => call.startsWith("timeout --kill-after"))).toHaveLength(3);
      // The cleanup comes after an attempt that another follows, not after the last: two rounds of it.
      expect(result.calls.filter((call) => call.startsWith("timeout 30"))).toHaveLength(2);
      expect(result.calls.filter((call) => call === "sudo pkill -KILL -x apt-get")).toHaveLength(2);
    });
  });

  it("keeps the downloaded browser between runs, under a key that changes with Playwright's version, before the install", () => {
    const cache = steps.find((step) => step.uses?.startsWith("actions/cache@"));
    expect(cache?.with?.path).toBe("~/.cache/ms-playwright");
    expect(String(cache?.with?.key)).toContain("hashFiles('node_modules/playwright-core/package.json')");
    expect(steps.indexOf(cache!)).toBeLessThan(steps.indexOf(install!));
  });
});
