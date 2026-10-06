import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const contributing = fs.readFileSync(path.join(process.cwd(), "CONTRIBUTING.md"), "utf-8");

describe("CONTRIBUTING.md", () => {
  it("links only to files and chapters that exist", () => {
    const links = [...contributing.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map((match) => match[1]).filter((link) => !/^https?:/.test(link));

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(fs.existsSync(path.join(process.cwd(), link)), link).toBe(true);
  });

  it("names only npm scripts that exist", () => {
    const scripts: Record<string, string> = JSON.parse(fs.readFileSync("package.json", "utf-8")).scripts;
    const named = [...contributing.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);

    expect(named).toEqual(expect.arrayContaining(["db:up", "db:migrate", "i18n:extract", "check"]));
    for (const script of named) expect(scripts, script).toHaveProperty(script);
  });

  it("points private security reports at this repository's advisory form", () => {
    expect(contributing).toContain("https://github.com/joeran-kuschel/dinner-planner/security/advisories/new");
  });

  it("names the Node version of the Docker image", () => {
    const [, major] = /FROM node:(\d+)-alpine AS app/.exec(fs.readFileSync("Dockerfile", "utf-8"))!;

    expect(contributing).toContain(`Node.js ${major}`);
  });
});
