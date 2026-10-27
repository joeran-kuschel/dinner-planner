import fs from "node:fs";
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

  it("uses the database of compose.yaml and the URL of .env.example, with a password of its own, reached by the service's name", () => {
    const compose = parse(fs.readFileSync(path.join(process.cwd(), "compose.yaml"), "utf-8")).services.db;
    const service = workflow.jobs.check.services.postgres;
    expect(service.image).toBe(compose.image);
    expect(service.env.POSTGRES_USER).toBe(compose.environment.POSTGRES_USER);
    expect(service.env.POSTGRES_DB).toBe(compose.environment.POSTGRES_DB);

    // compose.yaml reads its password from .env, which the runner does not have: the job's is a throwaway.
    const url = new URL(workflow.jobs.check.env.DATABASE_URL);
    expect(url.password).toBe(service.env.POSTGRES_PASSWORD);
    expect(url.password).not.toBe(compose.environment.POSTGRES_PASSWORD);

    // The job runs in a container: the database is the service's name on Postgres's own port, the container side of compose's mapping.
    expect(url.hostname).toBe("postgres");
    expect(url.port).toBe(String(compose.ports[0]).split(":").pop());

    const example = new URL(/^DATABASE_URL="(.+)"$/m.exec(fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf-8"))![1]);
    expect([url.username, url.pathname, url.search]).toEqual([example.username, example.pathname, example.search]);
  });

  it("uses the Node version of the Docker image", () => {
    const node = steps.find((step) => step.uses?.startsWith("actions/setup-node"));
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf-8");
    expect(dockerfile).toContain(`FROM node:${node?.with?.["node-version"]}-alpine AS app`);
  });

  describe("the browser", () => {
    const container = workflow.jobs.check.container;
    const IMAGE = /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}$/;

    it("comes with Playwright's image, pinned by its digest, so nothing is installed from apt at run time", () => {
      expect(container.image).toMatch(IMAGE);
      for (const step of steps) {
        expect(step.run ?? "").not.toMatch(/playwright install|\bapt(-get)?\s|\bdpkg\b/);
        expect(step.uses ?? "").not.toMatch(/^actions\/cache@/);
      }
    });

    it("is the image of the installed Playwright version (the lockfile's, as `npm ci` installs it): update the tag and the digest together with Playwright", () => {
      const installed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules/playwright-core/package.json"), "utf-8")).version;
      const tag = IMAGE.exec(container.image)?.[1];
      expect(tag, `check.yml runs Playwright ${installed} in the image of ${tag}: set the tag to v${installed}-noble and the digest to \`docker buildx imagetools inspect mcr.microsoft.com/playwright:v${installed}-noble\``).toBe(installed);
    });

    it("trusts the workspace for git before the check, since the container's root user is not its owner (the infra tests run `git ls-files`)", () => {
      const trust = steps.findIndex((step) => step.run?.includes("git config --global --add safe.directory"));
      expect(steps[trust]?.run).toContain('"$GITHUB_WORKSPACE"');
      expect(trust).toBeGreaterThan(steps.findIndex((step) => step.uses?.startsWith("actions/checkout")));
      expect(trust).toBeLessThan(steps.findIndex((step) => step.run === "npm run check"));
    });

    it("runs Chromium the way Playwright advises in a container", () => {
      expect(container.options).toContain("--ipc=host");
      expect(container.options).toContain("--init");
    });
  });
});
