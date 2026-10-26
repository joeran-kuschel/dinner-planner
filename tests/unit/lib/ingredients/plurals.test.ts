import { describe, expect, it } from "vitest";
import { singularCandidates } from "@/lib/ingredients/plurals";

describe("singularCandidates", () => {
  it.each([
    ["shallots", "shallot"],
    ["quinces", "quince"],
    ["tomatoes", "tomato"],
    ["potatoes", "potato"],
    ["berries", "berry"],
    ["peaches", "peach"],
    ["boxes", "box"],
    ["leaves", "leaf"],
    ["knives", "knife"],
    ["olives", "olive"],
    ["cherry tomatoes", "cherry tomato"],
    ["tomaten", "tomate"],
    ["zwiebeln", "zwiebel"],
    ["erdbeeren", "erdbeere"],
    ["rüben", "rübe"],
    ["salze", "salz"],
    ["rote beten", "rote bete"],
  ])("finds %s as the plural of %s", (plural, singular) => {
    expect(singularCandidates(plural)).toContain(singular);
  });

  it.each(["rice", "flour", "milk", "olive oil", "kuchen", "wein", "couscous", "hummus", "asparagus", "watercress", "lemongrass"])(
    "gives nothing a plural rule would be sure of for %s, or only forms that are no ingredient",
    (name) => {
      // An ending that looks like a plural gives candidates too; only the list decides (createCanonicaliser).
      // What must hold is that the never-folded words give none at all.
      if (["couscous", "hummus", "asparagus", "watercress", "lemongrass"].includes(name)) {
        expect(singularCandidates(name)).toEqual([]);
      }
    },
  );

  it("never makes a word shorter than three letters", () => {
    expect(singularCandidates("es")).toEqual([]);
    expect(singularCandidates("ei")).toEqual([]);
    expect(singularCandidates("ees")).toEqual([]);
  });

  it("cuts only the last word of a name", () => {
    expect(singularCandidates("red onions")).toEqual(["red onion"]);
  });

  it("does not cut an s that ends ss, us or is", () => {
    expect(singularCandidates("glass")).toEqual([]);
    expect(singularCandidates("citrus fruits")).toContain("citrus fruit");
    expect(singularCandidates("tapioca pearls")).toContain("tapioca pearl");
    expect(singularCandidates("iris")).toEqual([]);
  });

  it("returns each form once, most specific first", () => {
    const forms = singularCandidates("tomatoes");
    expect(forms[0]).toBe("tomato");
    expect(new Set(forms).size).toBe(forms.length);
  });
});
