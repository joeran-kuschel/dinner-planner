import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/ingredients/canonical";
import { MEASURES } from "@/lib/ingredients/measures";

describe("the unit table", () => {
  it("has unique ids", () => {
    expect(new Set(MEASURES.map((m) => m.id)).size).toBe(MEASURES.length);
  });

  it("lets no spelling belong to two units", () => {
    const owners = new Map<string, Set<string>>();
    for (const m of MEASURES) {
      for (const name of [...m.en, ...m.de]) {
        const key = normalizeName(name);
        owners.set(key, (owners.get(key) ?? new Set()).add(m.id));
      }
    }
    expect([...owners].filter(([, ids]) => ids.size > 1)).toEqual([]);
  });

  it("names every unit in both languages", () => {
    for (const m of MEASURES) {
      expect(m.en.length, m.id).toBeGreaterThan(0);
      expect(m.de.length, m.id).toBeGreaterThan(0);
    }
  });

  it("counts kg in g and l in ml, by 1000, and nothing else", () => {
    const withBase = MEASURES.filter((m) => m.base).map((m) => [m.id, m.base]);
    expect(withBase).toEqual([
      ["kg", { id: "g", factor: 1000 }],
      ["l", { id: "ml", factor: 1000 }],
    ]);
  });

  it.each(["tsp", "tbsp", "cup", "pinch", "dash", "piece", "clove", "can", "bunch", "slice", "pack", "sprig"])(
    "gives %s no base to be converted to",
    (id) => {
      expect(MEASURES.find((m) => m.id === id)?.base).toBeUndefined();
    },
  );

  it("knows the spoons by both of their names", () => {
    const tbsp = MEASURES.find((m) => m.id === "tbsp")!;
    expect(tbsp.de).toContain("EL");
    expect(tbsp.en).toContain("tbsp");
  });

  it("gives a plural only to countable units, each non-empty, and one that is a name of its unit or a plain plural", () => {
    const withPlural = MEASURES.filter((m) => m.plural).map((m) => m.id);
    expect(withPlural.sort()).toEqual(["bunch", "can", "clove", "cup", "dash", "pack", "pinch", "piece", "slice", "sprig"].sort());
    for (const m of MEASURES.filter((m) => m.plural)) {
      for (const language of ["en", "de"] as const) {
        const plural = m.plural![language];
        if (plural === undefined) continue;
        expect(plural.trim(), `${m.id} ${language}`).not.toBe("");
      }
    }
  });

  it("gives the English plurals as names of the unit, so a typed plural is the same unit", () => {
    for (const m of MEASURES.filter((m) => m.plural?.en)) {
      expect(m.en.map(normalizeName), m.id).toContain(normalizeName(m.plural!.en!));
    }
  });

  it("gives the units that cannot be counted no plural", () => {
    for (const id of ["g", "kg", "ml", "l", "tsp", "tbsp"]) expect(MEASURES.find((m) => m.id === id)?.plural, id).toBeUndefined();
  });
});
