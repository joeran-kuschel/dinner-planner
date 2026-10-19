import { describe, expect, it } from "vitest";
import {
  baseNameId,
  createCanonicaliser,
  followRules,
  GROUP_PREFIX,
  isGroupId,
  type MergeRule,
  nameIdOfKey,
  normalizeName,
  unitIdOfKey,
} from "@/lib/ingredients/canonical";

const en = createCanonicaliser({ locale: "en" });
const de = createCanonicaliser({ locale: "de" });
const rule = (from: string, to: string, toLabel = to): MergeRule => ({ from, to, fromLabel: from, toLabel });

describe("normalizeName", () => {
  it.each([
    ["  Red   Wine ", "red wine"],
    ["TOMATEN", "tomaten"],
    ["a\t b\n c", "a b c"],
    ["   ", ""],
    ["a|b", "a b"],
    ["|a||b|", "a b"],
  ])("turns %j into %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe("bars in names and units", () => {
  it("leave exactly one bar in a key, so the name and unit round-trip", () => {
    const { key, nameId, unitId } = en.identify("a|b", "x|y");
    expect(key.split("|")).toHaveLength(2);
    expect(key).toBe("a b|x y");
    expect(nameIdOfKey(key)).toBe(nameId);
    expect(unitIdOfKey(key)).toBe(unitId);
    expect([nameId, unitId]).toEqual(["a b", "x y"]);
  });

  it("map a stored key with extra bars to a key with one", () => {
    expect(en.keyOfStored("a|b|x|y").split("|")).toHaveLength(2);
  });
});

describe("key helpers", () => {
  it("splits a key at its last bar", () => {
    expect(nameIdOfKey("~tomato|g")).toBe("~tomato");
    expect(unitIdOfKey("~tomato|g")).toBe("g");
    expect(nameIdOfKey("a|b|c")).toBe("a|b");
    expect(unitIdOfKey("a|b|c")).toBe("c");
    expect(unitIdOfKey("milk|")).toBe("");
  });

  it("reads a key without a bar as a name without a unit", () => {
    expect(nameIdOfKey("milk")).toBe("milk");
    expect(unitIdOfKey("milk")).toBe("");
  });

  it("knows a group id only when the group exists", () => {
    expect(GROUP_PREFIX).toBe("~");
    expect(isGroupId("~tomato")).toBe(true);
    expect(isGroupId("~nonsense")).toBe(false);
    expect(isGroupId("tomato")).toBe(false);
  });
});

describe("identify: names", () => {
  it("makes Tomaten and tomatoes the same name, whatever the case and spacing", () => {
    expect(en.identify("Tomaten", "g").key).toBe("~tomato|g");
    expect(en.identify("  TOMATOES ", "g").key).toBe("~tomato|g");
    expect(de.identify("Tomaten", "g").key).toBe("~tomato|g");
  });

  it("gives the same key in both page languages", () => {
    expect(de.identify("Zwiebeln", null).key).toBe(en.identify("onions", null).key);
  });

  it("keeps an unknown name as typed, trimmed, collapsed and lowercased", () => {
    expect(en.identify("  Dragon   Fruit ", null).key).toBe("dragon fruit|");
  });

  it("counts garlic cloves as garlic in cloves when no unit is typed", () => {
    const id = en.identify("garlic cloves", null);
    expect(id).toMatchObject({ key: "~garlic|clove", nameId: "~garlic", unitId: "clove" });
    expect(en.identify("Knoblauchzehe", "").key).toBe("~garlic|clove");
  });

  it("lets a typed unit win over the implied one", () => {
    expect(en.identify("garlic cloves", "g").key).toBe("~garlic|g");
  });

  it("makes garlic in cloves the same line as garlic with the unit 'Zehen'", () => {
    expect(en.identify("Knoblauch", "Zehen").key).toBe(en.identify("garlic cloves", null).key);
  });
});

describe("identify: units", () => {
  it.each([
    ["EL", "tbsp"],
    ["Esslöffel", "tbsp"],
    ["tablespoons", "tbsp"],
    ["TL", "tsp"],
    ["grams", "g"],
    ["Gramm", "g"],
    ["Stück", "piece"],
    ["Dosen", "can"],
  ])("reads %s as %s", (typed, unit) => {
    expect(en.identify("sugar", typed).unitId).toBe(unit);
  });

  it("counts kg in g with the factor 1000 and l in ml", () => {
    expect(en.identify("flour", "kg")).toMatchObject({ key: "~flour|g", unitId: "g", ownUnitId: "kg", factor: 1000 });
    expect(en.identify("milk", "l")).toMatchObject({ key: "~milk|ml", unitId: "ml", ownUnitId: "l", factor: 1000 });
    expect(en.identify("flour", "g").factor).toBe(1);
  });

  it("never turns a spoon into a weight or a volume, nor a teaspoon into a tablespoon", () => {
    expect(en.identify("sugar", "tbsp").key).not.toBe(en.identify("sugar", "g").key);
    expect(en.identify("sugar", "tbsp").key).not.toBe(en.identify("sugar", "ml").key);
    expect(en.identify("sugar", "tsp").key).not.toBe(en.identify("sugar", "tbsp").key);
    expect(en.identify("sugar", "cup").key).not.toBe(en.identify("sugar", "ml").key);
  });

  it("keeps an unknown unit as typed, lowercased and trimmed, and only merges it with itself", () => {
    expect(en.identify("wine", " Bottles ").key).toBe("wine|bottles");
    expect(en.identify("wine", "BOTTLES").key).toBe(en.identify("wine", "bottles").key);
    expect(en.identify("wine", "bottles").key).not.toBe(en.identify("wine", "cans").key);
  });

  it("has no unit for blank or missing", () => {
    expect(en.identify("milk", null).unitId).toBe("");
    expect(en.identify("milk", undefined).key).toBe("~milk|");
    expect(en.identify("milk", "   ").key).toBe("~milk|");
  });
});

describe("rules", () => {
  it("lists a merged name as its target", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("aubergine", "eggplant", "Eggplant")] });
    expect(merged.identify("Aubergine", "g").key).toBe("eggplant|g");
    expect(merged.identify("eggplant", "g").key).toBe("eggplant|g");
  });

  it("applies a rule on top of the dictionary and merges a group into a typed name", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("~shallot", "~onion")] });
    expect(merged.identify("shallots", null).key).toBe("~onion|");
    expect(merged.identify("Schalotten", null).key).toBe("~onion|");
  });

  it("follows a chain", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("a", "b"), rule("b", "c")] });
    expect(merged.identify("a", null).key).toBe("c|");
  });

  it("follows a merge made on the group an implied name belongs to", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("~garlic", "knobi")] });
    expect(merged.identify("garlic cloves", null).key).toBe("knobi|clove");
  });
});

describe("followRules", () => {
  const map = (...rules: MergeRule[]) => new Map(rules.map((r) => [r.from, r]));

  it("returns the name when no rule applies", () => {
    expect(followRules("a", map())).toBe("a");
  });

  it("follows a chain to its end", () => {
    expect(followRules("a", map(rule("a", "b"), rule("b", "c")))).toBe("c");
  });

  it("stops after 20 steps on a loop instead of hanging", () => {
    const result = followRules("a", map(rule("a", "b"), rule("b", "a")));
    expect(["a", "b"]).toContain(result);
  });

  it("stops at exactly 20 steps on a long chain", () => {
    const rules = Array.from({ length: 30 }, (_, i) => rule(`n${i}`, `n${i + 1}`));
    expect(followRules("n0", map(...rules))).toBe("n20");
  });
});

describe("baseNameId", () => {
  it("is the group for a dictionary name, even an implied one", () => {
    expect(baseNameId("Tomaten")).toBe("~tomato");
    expect(baseNameId("garlic cloves")).toBe("~garlic");
  });

  it("is the normalised name otherwise", () => {
    expect(baseNameId(" Dragon  Fruit")).toBe("dragon fruit");
  });
});

describe("keyOfStored", () => {
  it.each([
    ["tomatoes|g", "~tomato|g"],
    ["red wine|bottles", "~red-wine|bottles"],
    ["Tomaten|EL", "~tomato|tbsp"],
    ["dish soap|", "dish soap|"],
    ["flour|kg", "~flour|g"],
    ["garlic cloves|", "~garlic|clove"],
  ])("maps the legacy key %s to %s", (legacy, canonical) => {
    expect(en.keyOfStored(legacy)).toBe(canonical);
  });

  it("is idempotent", () => {
    for (const key of ["tomatoes|g", "~tomato|g", "dish soap|", "flour|kg", "garlic cloves|", "a|b|c", "milk"]) {
      const once = en.keyOfStored(key);
      expect(en.keyOfStored(once), key).toBe(once);
    }
  });

  it("is idempotent with rules", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("~shallot", "~onion")] });
    const once = merged.keyOfStored("shallots|");
    expect(once).toBe("~onion|");
    expect(merged.keyOfStored(once)).toBe(once);
  });

  it("leaves a key without a bar alone", () => {
    expect(en.keyOfStored("milk")).toBe("milk");
  });

  it("follows the rules for a stored key", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("aubergine", "eggplant")] });
    expect(merged.keyOfStored("aubergine|")).toBe("eggplant|");
  });
});

describe("nameLabel", () => {
  it("names a group in the page's language, capitalised", () => {
    expect(en.nameLabel("~tomato")).toBe("Tomato");
    expect(de.nameLabel("~tomato")).toBe("Tomate");
    expect(de.nameLabel("~caraway")).toBe("Kümmel");
    expect(en.nameLabel("~olive-oil")).toBe("Olive oil");
  });

  it("uses the target's label of a rule for a name that is not in the dictionary", () => {
    const merged = createCanonicaliser({ locale: "en", rules: [rule("aubergine", "eggplant", "Eggplant")] });
    expect(merged.nameLabel("eggplant")).toBe("Eggplant");
  });

  it("is null for a name nobody knows, so the name as typed shows", () => {
    expect(en.nameLabel("dragon fruit")).toBeNull();
    expect(en.nameLabel("~nonsense")).toBeNull();
  });
});

describe("aliases", () => {
  it("lists every name of the group in both languages, normalised", () => {
    const aliases = en.aliases("Salz");
    expect(aliases).toEqual(expect.arrayContaining(["salt", "salz"]));
    expect(en.aliases("tomatoes")).toEqual(expect.arrayContaining(["tomaten", "tomato"]));
  });

  it("is the name alone when it is not in the dictionary", () => {
    expect(en.aliases("  Dragon Fruit ")).toEqual(["dragon fruit"]);
  });
});

describe("unitLabel", () => {
  it("names a known unit in the page's language", () => {
    expect(en.unitLabel("EL")).toBe("tbsp");
    expect(de.unitLabel("tbsp")).toBe("EL");
    expect(de.unitLabel("grams")).toBe("g");
    expect(de.unitLabel("piece")).toBe("Stück");
  });

  it("is null for an unknown, blank or missing unit", () => {
    expect(en.unitLabel("bottles")).toBeNull();
    expect(en.unitLabel("")).toBeNull();
    expect(en.unitLabel(null)).toBeNull();
  });
});

describe("amount", () => {
  const amount = (
    canon: typeof en,
    unitId: string,
    own: string[],
    quantity: number | null,
    typedUnit: string | null = null,
  ) => canon.amount({ unitId, ownUnitIds: new Set(own), quantity, typedUnit });

  it("shows one unit throughout as the page's language names it", () => {
    expect(amount(de, "tbsp", ["tbsp"], 2, "tbsp")).toEqual({ quantity: 2, unit: "EL" });
    expect(amount(en, "tbsp", ["tbsp"], 2, "EL")).toEqual({ quantity: 2, unit: "tbsp" });
  });

  it("divides a lone multiple back: 1500 g summed from 1.5 kg shows as 1.5 kg", () => {
    expect(amount(en, "g", ["kg"], 1500, "kg")).toEqual({ quantity: 1.5, unit: "kg" });
  });

  it("keeps a lone kg below 1000 g as kg", () => {
    expect(amount(en, "g", ["kg"], 500, "kg")).toEqual({ quantity: 0.5, unit: "kg" });
  });

  it("shows g and kg mixed in g, and in kg from 1000", () => {
    expect(amount(en, "g", ["g", "kg"], 750)).toEqual({ quantity: 750, unit: "g" });
    expect(amount(en, "g", ["g", "kg"], 999)).toEqual({ quantity: 999, unit: "g" });
    expect(amount(en, "g", ["g", "kg"], 1000)).toEqual({ quantity: 1, unit: "kg" });
    expect(amount(en, "g", ["g", "kg"], 2500)).toEqual({ quantity: 2.5, unit: "kg" });
    expect(amount(en, "ml", ["ml", "l"], 1250)).toEqual({ quantity: 1.25, unit: "l" });
  });

  it("rounds away floating point noise", () => {
    expect(amount(en, "g", ["kg"], 0.1 * 3 * 1000, "kg").quantity).toBe(0.3);
  });

  it("keeps a missing quantity missing", () => {
    expect(amount(en, "g", ["g", "kg"], null)).toEqual({ quantity: null, unit: "g" });
    expect(amount(en, "g", ["kg"], null, "kg")).toEqual({ quantity: null, unit: "kg" });
  });

  it("leaves a unit that is not in the table as typed", () => {
    expect(amount(en, "bottles", ["bottles"], 2, "Bottles")).toEqual({ quantity: 2, unit: "Bottles" });
    expect(amount(en, "", [""], 3, null)).toEqual({ quantity: 3, unit: null });
  });

  it("two spellings of one unit show the unit in the page's language", () => {
    expect(amount(de, "tbsp", ["tbsp"], 3, "tbsp")).toEqual({ quantity: 3, unit: "EL" });
  });

  describe("plural unit names", () => {
    it.each([
      [1, "clove"],
      [3, "cloves"],
      [0.5, "cloves"],
      [null, "clove"],
    ])("shows %s as %s in English", (quantity, unit) => {
      expect(amount(en, "clove", ["clove"], quantity, "clove").unit).toBe(unit);
    });

    it.each([
      [1, "Zehe"],
      [10.5, "Zehen"],
      [2, "Zehen"],
    ])("shows %s as %s in German", (quantity, unit) => {
      expect(amount(de, "clove", ["clove"], quantity, "clove").unit).toBe(unit);
    });

    it.each([
      ["can", 2, "Dosen"],
      ["bunch", 2, "Bund"],
      ["piece", 2, "Stück"],
      ["piece", 1, "Stück"],
    ])("names %s for %s in German as %s", (id, quantity, unit) => {
      expect(amount(de, id, [id], quantity, id).unit).toBe(unit);
    });

    it("never changes units without a plural", () => {
      for (const [id, name] of [["g", "g"], ["ml", "ml"], ["tsp", "TL"], ["tbsp", "EL"]] as const) {
        expect(amount(de, id, [id], 5, id).unit).toBe(name);
        expect(amount(de, id, [id], 1, id).unit).toBe(name);
      }
      expect(amount(en, "tbsp", ["tbsp"], 3, "tbsp").unit).toBe("tbsp");
    });

    it("unitLabel follows the quantity when given", () => {
      expect(en.unitLabel("clove", 1)).toBe("clove");
      expect(en.unitLabel("cloves", 1)).toBe("clove");
      expect(en.unitLabel("clove", 3)).toBe("cloves");
      expect(en.unitLabel("clove")).toBe("clove");
      expect(en.unitLabel("clove", null)).toBe("clove");
      expect(de.unitLabel("Dose", 2)).toBe("Dosen");
      expect(de.unitLabel("g", 2)).toBe("g");
    });
  });
});
