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

  it("runs the same `npm run check` as the developer's machine, after generating the Prisma client", () => {
    const runs = steps.map((step) => step.run);
    expect(runs).toContain("npm run check");
    expect(runs.indexOf("npm run db:generate")).toBeGreaterThan(runs.indexOf("npm ci"));
    expect(runs.indexOf("npm run db:generate")).toBeLessThan(runs.indexOf("npm run check"));
  });

  it("gets a read-only token and no secrets, and never runs fork code with write access", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on).not.toHaveProperty("pull_request_target");
    expect(fs.readFileSync(WORKFLOW, "utf-8")).not.toContain("secrets.");
  });

  it("uses the database of compose.yaml and the URL of .env.example", () => {
    const compose = parse(fs.readFileSync(path.join(process.cwd(), "compose.yaml"), "utf-8")).services.db;
    const service = workflow.jobs.check.services.postgres;
    expect(service.image).toBe(compose.image);
    expect(service.env).toEqual(compose.environment);
    expect(service.ports).toEqual(compose.ports);

    const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf-8");
    expect(example).toContain(`DATABASE_URL="${workflow.jobs.check.env.DATABASE_URL}"`);
  });

  it("uses the Node version of the Docker image and installs the browser Playwright needs", () => {
    const node = steps.find((step) => step.uses?.startsWith("actions/setup-node"));
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf-8");
    expect(dockerfile).toContain(`FROM node:${node?.with?.["node-version"]}-alpine AS app`);
    expect(steps.map((step) => step.run)).toContain("npx playwright install --with-deps chromium");
  });
});
