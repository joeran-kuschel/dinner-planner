import { describe, expect, it } from "vitest";
import { createCanonicaliser, normalizeName } from "@/lib/ingredients/canonical";
import { NAME_GROUPS } from "@/lib/ingredients/names";

const groupsOf = (language: "en" | "de") => {
  const owners = new Map<string, Set<string>>();
  for (const group of NAME_GROUPS) {
    for (const name of group[language]) {
      const key = normalizeName(name);
      owners.set(key, (owners.get(key) ?? new Set()).add(group.id));
    }
  }
  return owners;
};

describe("the name dictionary", () => {
  it("has 66 groups with unique ids", () => {
    const ids = NAME_GROUPS.map((group) => group.id);
    expect(ids).toHaveLength(66);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(["en", "de"] as const)("lets no %s name belong to two groups", (language) => {
    const shared = [...groupsOf(language)].filter(([, owners]) => owners.size > 1).map(([name, owners]) => [name, [...owners]]);
    expect(shared).toEqual([]);
  });

  it("lets a name that both languages use mean the same group in both", () => {
    const en = groupsOf("en");
    const clashes = [...groupsOf("de")].filter(([name, owners]) => en.has(name) && [...en.get(name)!][0] !== [...owners][0]);
    expect(clashes).toEqual([]);
  });

  it("gives every group at least one name in English and in German, none of them blank", () => {
    for (const group of NAME_GROUPS) {
      expect(group.en.length, group.id).toBeGreaterThan(0);
      expect(group.de.length, group.id).toBeGreaterThan(0);
      for (const name of [...group.en, ...group.de]) expect(name.trim(), group.id).not.toBe("");
    }
  });

  it("points every impliesGroup at a group that exists and pairs it with a unit", () => {
    const ids = new Set(NAME_GROUPS.map((group) => group.id));
    for (const group of NAME_GROUPS.filter((g) => g.impliesGroup || g.impliesUnit)) {
      expect(ids.has(group.impliesGroup!), group.id).toBe(true);
      expect(group.impliesUnit, group.id).toBeTruthy();
    }
  });

  describe("names that look alike stay apart", () => {
    const id = (name: string) => createCanonicaliser({ locale: "en" }).identify(name, null).nameId;

    it("keeps Kümmel (caraway) and Kreuzkümmel (cumin) in different groups, and Kümmel never resolves to cumin", () => {
      expect(id("Kümmel")).toBe("~caraway");
      expect(id("Kreuzkümmel")).toBe("~cumin");
      expect(id("Kümmel")).not.toBe(id("cumin"));
      expect(id("caraway")).toBe(id("Kümmel"));
      expect(id("cumin")).toBe(id("Kreuzkümmel"));
    });

    it.each([
      ["milk", "coconut milk"],
      ["olive oil", "vegetable oil"],
      ["onion", "red onion"],
      ["onion", "shallot"],
      ["red onion", "shallot"],
      ["tomato", "cherry tomatoes"],
      ["tomato", "peeled tomatoes"],
      ["tomato", "chopped tomatoes"],
      ["tomato", "tomato paste"],
      ["tomato", "passata"],
      ["peeled tomatoes", "chopped tomatoes"],
      ["pepper", "peppercorns"],
    ])("keeps %s and %s apart", (a, b) => {
      expect(id(a)).not.toBe(id(b));
    });
  });
});
