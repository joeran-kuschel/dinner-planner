import { describe, expect, it } from "vitest";
import { GROCERY_CATEGORIES, categoryLabel, parseGroceryCategory } from "@/lib/grocery-category";
import { testI18n } from "@/tests/support/i18n";

describe("GROCERY_CATEGORIES", () => {
  it("walks through the shop and ends with Other", () => {
    expect(GROCERY_CATEGORIES).toEqual([
      "PRODUCE",
      "BAKERY",
      "MEAT_FISH",
      "DAIRY_EGGS",
      "PASTA_RICE",
      "PANTRY",
      "HERBS_SPICES",
      "FROZEN",
      "DRINKS",
      "OTHER",
    ]);
  });
});

describe("categoryLabel", () => {
  it.each(GROCERY_CATEGORIES)("names %s in both languages", (category) => {
    const en = categoryLabel(category, testI18n("en"));
    const de = categoryLabel(category, testI18n("de"));
    expect(en).not.toBe(category);
    expect(de).toBeTruthy();
    if (category !== "OTHER") expect(de).not.toBe(en);
  });
});

describe("the added sections", () => {
  it("names Pasta, rice and Herbs & spices in English and German", () => {
    const en = testI18n("en");
    const de = testI18n("de");
    expect(categoryLabel("PASTA_RICE", en)).toBe("Pasta, rice, etc.");
    expect(categoryLabel("PASTA_RICE", de)).toBe("Nudeln, Reis usw.");
    expect(categoryLabel("HERBS_SPICES", en)).toBe("Herbs & spices");
    expect(categoryLabel("HERBS_SPICES", de)).toBe("Kräuter & Gewürze");
  });

  it("parses the new values from a form", () => {
    expect(parseGroceryCategory("PASTA_RICE")).toBe("PASTA_RICE");
    expect(parseGroceryCategory("HERBS_SPICES")).toBe("HERBS_SPICES");
  });
});

describe("parseGroceryCategory", () => {
  it.each(GROCERY_CATEGORIES)("accepts %s", (category) => {
    expect(parseGroceryCategory(category)).toBe(category);
  });

  it.each([null, undefined, "", "produce", "FISH", " PRODUCE", new File([], "x")])(
    "falls back to Other for %j",
    (value) => {
      expect(parseGroceryCategory(value)).toBe("OTHER");
    },
  );
});
