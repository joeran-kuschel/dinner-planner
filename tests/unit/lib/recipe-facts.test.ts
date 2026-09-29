import { describe, expect, it } from "vitest";
import { recipeFacts } from "@/lib/recipe-facts";
import { testI18n } from "@/tests/support/i18n";

const en = testI18n("en");
const de = testI18n("de");

describe("recipeFacts", () => {
  it("lists servings, ingredient count, prep time and how often it is planned", () => {
    expect(recipeFacts(en, { servings: 4, prepMinutes: 30, ingredients: 3, plannedFor: 2 })).toEqual([
      "Serves 4",
      "3 ingredients",
      "30 min",
      "planned 2×",
    ]);
  });

  it("leaves out what is missing: no prep time, not planned, counts not given", () => {
    expect(recipeFacts(en, { servings: 2, prepMinutes: null, ingredients: 1, plannedFor: 0 })).toEqual([
      "Serves 2",
      "1 ingredient",
    ]);
    expect(recipeFacts(en, { servings: 2, prepMinutes: 15 })).toEqual(["Serves 2", "15 min"]);
  });

  it.each([
    [{ servings: 1, prepMinutes: null, ingredients: 1, plannedFor: 1 }, ["Für 1 Person", "1 Zutat", "1× geplant"]],
    [{ servings: 4, prepMinutes: 45, ingredients: 0, plannedFor: 3 }, ["Für 4 Personen", "0 Zutaten", "45 Min.", "3× geplant"]],
  ])("speaks German with its own plurals (%j)", (facts, expected) => {
    expect(recipeFacts(de, facts)).toEqual(expected);
  });
});
