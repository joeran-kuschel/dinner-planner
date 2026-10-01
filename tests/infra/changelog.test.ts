import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GROUPS = ["Added", "Changed", "Fixed", "Removed"];

interface Section {
  heading: string;
  groups: { name: string; bullets: number }[];
  bullets: number;
}

/** CHANGELOG.md as sections → groups → number of bullets. */
function parse(text: string): Section[] {
  const sections: Section[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) sections.push({ heading: line.slice(3), groups: [], bullets: 0 });
    else if (line.startsWith("### ")) sections.at(-1)?.groups.push({ name: line.slice(4), bullets: 0 });
    else if (line.startsWith("- ") && sections.length) {
      sections.at(-1)!.bullets++;
      const group = sections.at(-1)!.groups.at(-1);
      if (group) group.bullets++;
    }
  }
  return sections;
}

const sections = parse(readFileSync(path.resolve(__dirname, "../../CHANGELOG.md"), "utf8"));

describe("CHANGELOG.md", () => {
  it("starts its sections with Unreleased", () => {
    expect(sections[0].heading).toBe("[Unreleased]");
  });

  it("then lists dated sections, newest first and each day once", () => {
    const dates = sections.slice(1).map((section) => section.heading);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates).toEqual([...new Set(dates)].sort().reverse());
  });

  it("uses Added, Changed, Fixed and Removed, once each and in that order", () => {
    for (const { heading, groups } of sections) {
      const names = groups.map((group) => group.name);
      expect(names, heading).toEqual(GROUPS.filter((name) => names.includes(name)));
      expect(names.length, heading).toBe(new Set(names).size);
    }
  });

  it("has an entry in every group and in every dated section", () => {
    for (const { heading, groups, bullets } of sections) {
      for (const group of groups) expect(group.bullets, `${heading} / ${group.name}`).toBeGreaterThan(0);
      if (heading !== "[Unreleased]") expect(bullets, heading).toBeGreaterThan(0);
    }
  });
});
