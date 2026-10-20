import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

// Every page sets its own tab title (documentation/backend/page-titles.md). The not-found file takes no metadata.
const pages = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app"], { encoding: "utf-8" })
  .split("\n")
  .filter((file) => /(^|\/)page\.tsx$/.test(file) && fs.existsSync(file));

describe("page titles", () => {
  it("finds the app's pages", () => {
    expect(pages).toContain("app/page.tsx");
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pages)("%s exports generateMetadata", (file) => {
    expect(fs.readFileSync(file, "utf-8")).toMatch(/export (async )?function generateMetadata\b/);
  });
});
