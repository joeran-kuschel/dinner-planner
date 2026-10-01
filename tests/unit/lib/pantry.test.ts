import { describe, expect, it } from "vitest";
import { applyStaples, MAX_STAPLE_LENGTH, MAX_STAPLES, normalizeStaple, splitStaples } from "@/lib/pantry";

describe("normalizeStaple", () => {
  it.each([
    ["Salt", "salt"],
    ["  Olive   Oil ", "olive oil"],
    ["GROUND CUMIN", "ground cumin"],
    ["   ", ""],
  ])("normalizeStaple(%j) is %j", (raw, expected) => {
    expect(normalizeStaple(raw)).toBe(expected);
  });

  it("has limits that fit the field", () => {
    expect(MAX_STAPLE_LENGTH).toBe(60);
    expect(MAX_STAPLES).toBe(200);
  });
});

describe("splitStaples", () => {
  const line = (label: string, manual = false) => ({ label, manual });
  const labels = (lines: { label: string }[]) => lines.map((l) => l.label);

  it("hides the lines whose name is a staple, ignoring case and spacing", () => {
    const { shown, hidden } = splitStaples([line("Salt"), line("Rice"), line("  OLIVE  oil ")], ["salt", "olive oil"]);
    expect(labels(hidden)).toEqual(["Salt", "  OLIVE  oil "]);
    expect(labels(shown)).toEqual(["Rice"]);
  });

  it("matches the whole name only, not a part of it", () => {
    const { shown, hidden } = splitStaples([line("Olive oil"), line("Sea salt"), line("Oil")], ["oil", "salt"]);
    expect(labels(hidden)).toEqual(["Oil"]);
    expect(labels(shown)).toEqual(["Olive oil", "Sea salt"]);
  });

  it("never hides a line added by hand", () => {
    const { shown, hidden } = splitStaples([line("Salt", true), line("Salt")], ["salt"]);
    expect(shown).toEqual([line("Salt", true)]);
    expect(hidden).toEqual([line("Salt")]);
  });

  it("never hides a derived line that a line added by hand shares its name and unit with", () => {
    const shared = { label: "Salt", manual: false, handAdded: true };
    const { shown, hidden } = splitStaples([shared, line("Salt")], ["salt"]);
    expect(shown).toEqual([shared]);
    expect(hidden).toEqual([line("Salt")]);
  });

  it("keeps the order of the lines in both lists", () => {
    const { shown, hidden } = splitStaples([line("b"), line("salt"), line("a"), line("oil")], ["salt", "oil"]);
    expect(labels(shown)).toEqual(["b", "a"]);
    expect(labels(hidden)).toEqual(["salt", "oil"]);
  });

  it("hides nothing without staples, and nothing in an empty list", () => {
    expect(splitStaples([line("Salt")], [])).toEqual({ shown: [line("Salt")], hidden: [] });
    expect(splitStaples([], ["salt"])).toEqual({ shown: [], hidden: [] });
  });

  it("accepts the staples as any iterable, such as a Set", () => {
    expect(labels(splitStaples([line("Salt")], new Set(["salt"])).hidden)).toEqual(["Salt"]);
  });
});

describe("applyStaples", () => {
  const line = (label: string, manual = false) => ({ label, manual });
  const LINES = [line("Oil"), line("Rice"), line("Salt"), line("Soap", true)];

  it("lists the lines to shop for and counts the hidden ones", () => {
    const view = applyStaples(LINES, ["oil", "salt"], false);
    expect(view.lines.map((l) => l.label)).toEqual(["Rice", "Soap"]);
    expect(view.hiddenCount).toBe(2);
    expect(view.allInPantry).toBe(false);
  });

  it("lists everything on request, marking the lines a staple hides", () => {
    const view = applyStaples(LINES, ["oil", "salt"], true);
    expect(view.lines.map((l) => [l.label, l.pantry ?? false])).toEqual([
      ["Oil", true],
      ["Rice", false],
      ["Salt", true],
      ["Soap", false],
    ]);
    expect(view.hiddenCount).toBe(2);
    expect(view.allInPantry).toBe(false);
  });

  it("is all in the pantry when only staples are left, with or without showing them", () => {
    expect(applyStaples([line("Oil"), line("Salt")], ["oil", "salt"], false)).toMatchObject({
      lines: [],
      hiddenCount: 2,
      allInPantry: true,
    });
    expect(applyStaples([line("Oil")], ["oil"], true).allInPantry).toBe(true);
  });

  it("is not all in the pantry for an empty list, or when nothing is hidden", () => {
    expect(applyStaples([], ["oil"], false)).toEqual({ lines: [], hiddenCount: 0, allInPantry: false });
    expect(applyStaples([line("Rice")], [], false).allInPantry).toBe(false);
  });

  it("does not change the lines it is given", () => {
    const lines = [line("Oil")];
    applyStaples(lines, ["oil"], true);
    expect(lines).toEqual([{ label: "Oil", manual: false }]);
  });
});
