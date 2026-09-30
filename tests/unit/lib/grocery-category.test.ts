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
      "PANTRY",
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
