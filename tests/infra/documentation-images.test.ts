import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The screenshots in documentation/images (made by `npm run docs:screenshots`, documentation/backend/doc-screenshots.md):
// every picture a page shows is there and described, and no picture is left over.

const DOCS = path.join(process.cwd(), "documentation");
const IMAGES = path.join(DOCS, "images");
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "images" ? [] : markdownFiles(file);
    return entry.name.endsWith(".md") ? [file] : [];
  });
}

/** Every image a documentation page shows: the page, its alt text and the file it points at. */
const shown = markdownFiles(DOCS).flatMap((page) =>
  [...readFileSync(page, "utf8").matchAll(IMAGE)].map(([, alt, source]) => ({
    page: path.relative(DOCS, page),
    alt,
    file: path.resolve(path.dirname(page), source),
  })),
);

describe("documentation images", () => {
  it("has screenshots on the pages", () => {
    expect(shown.length).toBeGreaterThan(0);
  });

  it.each(shown.map((image) => [`${image.page}: ${path.basename(image.file)}`, image] as const))(
    "%s is a file in documentation/images and has alt text that says what it shows",
    (_label, image) => {
      expect(path.dirname(image.file)).toBe(IMAGES);
      expect(existsSync(image.file)).toBe(true);
      expect(image.alt.trim().length).toBeGreaterThanOrEqual(20);
    },
  );

  it("keeps no image that no page shows, and none that is large", () => {
    const used = new Set(shown.map((image) => image.file));
    for (const name of readdirSync(IMAGES)) {
      const file = path.join(IMAGES, name);
      expect(used.has(file), `${name} is not shown on any page`).toBe(true);
      expect(statSync(file).size, `${name} is over 300 KB: lower the quality or the size`).toBeLessThan(300 * 1024);
    }
  });
});
