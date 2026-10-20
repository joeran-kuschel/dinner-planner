import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/ingredients/canonical";
import { isSmallAmount, MEASURES } from "@/lib/ingredients/measures";

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

  it.each(["tsp", "tbsp", "cup", "pinch", "dash", "knife-tip", "piece", "clove", "can", "bunch", "slice", "pack", "sprig"])(
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
    expect(withPlural.sort()).toEqual(["bunch", "can", "clove", "cup", "dash", "knife-tip", "pack", "pinch", "piece", "slice", "sprig"].sort());
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

describe("isSmallAmount", () => {
  it.each(["tsp", "tbsp", "pinch", "dash", "knife-tip"])("flags %s as small whatever the number", (id) => {
    expect(isSmallAmount(id, 1)).toBe(true);
    expect(isSmallAmount(id, 500)).toBe(true);
  });

  it("flags exactly the units marked small", () => {
    expect(MEASURES.filter((m) => m.small).map((m) => m.id)).toEqual(["tsp", "tbsp", "pinch", "dash", "knife-tip"]);
  });

  it.each([
    [99, true],
    [99.999999, true],
    [100, false],
    [0, true],
    [0.5, true],
    [100.000001, false],
    [99.9999999999, false], // rounds to 100 at 1e-6
    [250, false],
  ])("treats %s g as small: %s", (grams, small) => {
    expect(isSmallAmount("g", grams)).toBe(small);
  });

  it("never calls a line without an amount small", () => {
    expect(isSmallAmount("g", null)).toBe(false);
    expect(isSmallAmount("tsp", null)).toBe(false);
    expect(isSmallAmount("", null)).toBe(false);
  });

  it.each(["piece", "clove", "cup", "ml", "l", "can", "bunch", "slice", "pack", "sprig", "kg", ""])(
    "never calls an amount in %s small",
    (id) => {
      expect(isSmallAmount(id, 1)).toBe(false);
      expect(isSmallAmount(id, 0.01)).toBe(false);
    },
  );

  it("knows the knife tip by its English and German names", () => {
    const tip = MEASURES.find((m) => m.id === "knife-tip")!;
    expect(tip.en).toEqual(["knife tip", "knife tips", "knifepoint"]);
    expect(tip.de).toEqual(["Messerspitze", "Messerspitzen", "Msp"]);
  });
});
