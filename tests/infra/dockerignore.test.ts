import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The image build copies the repository and type-checks it with `next build`, but the tests and their configuration are not in the
// image (see .dockerignore). A Playwright config that is not listed there reaches the build, imports another config that is
// missing, and breaks the deploy: `npm run check` never builds the image, so nothing else would notice (the one that did, 2026-10-27).

const ROOT = process.cwd();
const ignored = new Set(
  readFileSync(`${ROOT}/.dockerignore`, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")),
);

describe(".dockerignore", () => {
  const configs = readdirSync(ROOT).filter((name) => /^(playwright|vitest)[\w.-]*\.config\.m?ts$/.test(name));

  it("finds the test configurations", () => {
    expect(configs).toContain("playwright.config.ts");
  });

  it.each(configs)("leaves %s out of the image", (name) => {
    expect(ignored.has(name)).toBe(true);
  });

  it("leaves out the documentation's screenshots, which the image does not need", () => {
    expect(ignored.has("documentation/images")).toBe(true);
  });
});
