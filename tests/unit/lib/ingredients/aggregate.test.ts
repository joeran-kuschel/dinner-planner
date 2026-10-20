import { describe, expect, it } from "vitest";
import { aggregateIngredients, type IngredientInput, type MealInput, PLAIN_NAMES } from "@/lib/grocery";
import { createCanonicaliser } from "@/lib/ingredients/canonical";

const ing = (name: string, quantity: number | null, unit: string | null = null): IngredientInput => ({
  name,
  quantity,
  unit,
  category: "OTHER",
});
const meal = (recipe: string, ingredients: IngredientInput[], servings = 2, recipeServings = 2): MealInput => ({
  servings,
  recipe: { name: recipe, servings: recipeServings, ingredients },
});
const en = createCanonicaliser({ locale: "en" });
const de = createCanonicaliser({ locale: "de" });

describe("aggregateIngredients with the dictionary", () => {
  it("adds Tomaten and tomatoes into one line and lists both recipes", () => {
    const lines = aggregateIngredients(
      [meal("Pasta", [ing("Tomaten", 200, "g")]), meal("Salad", [ing("tomatoes", 300, "grams")])],
      en,
    );
    expect(lines).toEqual([
      expect.objectContaining({ key: "~tomato|g", label: "Tomato", quantity: 500, unit: "g", sources: ["Pasta", "Salad"] }),
    ]);
  });

  it("names the line in the page's language, not as typed", () => {
    const meals = [meal("Pasta", [ing("Tomaten", 200, "g")])];
    expect(aggregateIngredients(meals, en)[0].label).toBe("Tomato");
    expect(aggregateIngredients(meals, de)[0].label).toBe("Tomate");
    expect(aggregateIngredients(meals, de)[0].key).toBe(aggregateIngredients(meals, en)[0].key);
  });

  it("keeps a name the dictionary does not know as typed", () => {
    expect(aggregateIngredients([meal("A", [ing("  Dragon Fruit ", 1)])], en)[0]).toMatchObject({
      label: "Dragon Fruit",
      key: "dragon fruit|",
    });
  });

  it("keeps different units as two lines", () => {
    const lines = aggregateIngredients([meal("A", [ing("Tomaten", 200, "g"), ing("tomatoes", 2)])], en);
    expect(lines.map((l) => l.key).sort()).toEqual(["~tomato|", "~tomato|g"]);
  });

  it("never adds a spoon to a weight", () => {
    const lines = aggregateIngredients([meal("A", [ing("sugar", 2, "EL"), ing("Zucker", 50, "g")])], en);
    expect(lines.map((l) => [l.key, l.quantity])).toEqual(expect.arrayContaining([["~sugar|tbsp", 2], ["~sugar|g", 50]]));
    expect(lines).toHaveLength(2);
  });

  it("adds EL and tbsp, showing the unit in the page's language", () => {
    const meals = [meal("A", [ing("Olivenöl", 1, "EL")]), meal("B", [ing("olive oil", 2, "tbsp")])];
    expect(aggregateIngredients(meals, en)[0]).toMatchObject({ quantity: 3, unit: "tbsp", label: "Olive oil" });
    expect(aggregateIngredients(meals, de)[0]).toMatchObject({ quantity: 3, unit: "EL", label: "Olivenöl" });
  });

  it("sums kg and g and shows kg from 1000 g", () => {
    const lines = aggregateIngredients([meal("A", [ing("flour", 1, "kg")]), meal("B", [ing("Mehl", 500, "g")])], en);
    expect(lines[0]).toMatchObject({ key: "~flour|g", quantity: 1.5, unit: "kg" });
  });

  it("shows a total below 1000 g in g when kg and g are mixed", () => {
    const lines = aggregateIngredients([meal("A", [ing("flour", 0.25, "kg")]), meal("B", [ing("flour", 100, "g")])], en);
    expect(lines[0]).toMatchObject({ quantity: 350, unit: "g" });
  });

  it("scales kg by servings", () => {
    const lines = aggregateIngredients([meal("A", [ing("potatoes", 1, "kg")], 3, 2)], en);
    expect(lines[0]).toMatchObject({ quantity: 1.5, unit: "kg" });
  });

  it("scales a recipe written for 4 planned for 2", () => {
    const lines = aggregateIngredients([meal("A", [ing("Tomaten", 400, "g")], 2, 4)], en);
    expect(lines[0].quantity).toBe(200);
  });

  it("reads one unquantified part as 'to taste' for the whole line", () => {
    const lines = aggregateIngredients([meal("A", [ing("Salz", null)]), meal("B", [ing("salt", 5, null)])], en);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: "~salt|", quantity: null });
  });

  it("counts garlic cloves as garlic in cloves", () => {
    const lines = aggregateIngredients([meal("A", [ing("garlic cloves", 2)]), meal("B", [ing("Knoblauch", 3, "Zehen")])], en);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: "~garlic|clove", quantity: 5, label: "Garlic" });
  });

  it("names a countable unit in the singular for one and in the plural for any other amount", () => {
    const one = aggregateIngredients([meal("A", [ing("Knoblauch", 1, "Zehe")])], en)[0];
    const three = aggregateIngredients([meal("A", [ing("Knoblauch", 1, "Zehe")]), meal("B", [ing("garlic", 2, "cloves")])], en)[0];
    const german = aggregateIngredients([meal("A", [ing("garlic cloves", 3)])], de)[0];
    expect([one.quantity, one.unit]).toEqual([1, "clove"]);
    expect([three.quantity, three.unit]).toEqual([3, "cloves"]);
    expect([german.quantity, german.unit]).toEqual([3, "Zehen"]);
  });

  it("uses the singular for an unquantified countable line", () => {
    expect(aggregateIngredients([meal("A", [ing("garlic", null, "cloves")])], en)[0].unit).toBe("clove");
  });

  it("keeps Kümmel and Kreuzkümmel as two lines", () => {
    const lines = aggregateIngredients([meal("A", [ing("Kümmel", 1, "TL"), ing("Kreuzkümmel", 1, "TL")])], de);
    expect(lines.map((l) => l.label).sort()).toEqual(["Kreuzkümmel", "Kümmel"]);
  });

  it("applies a merge rule: aubergine is listed as eggplant with the target's label", () => {
    const canon = createCanonicaliser({
      locale: "en",
      rules: [{ from: "aubergine", to: "eggplant", fromLabel: "Aubergine", toLabel: "Eggplant" }],
    });
    const lines = aggregateIngredients([meal("A", [ing("Aubergine", 1)]), meal("B", [ing("eggplant", 2)])], canon);
    expect(lines).toEqual([expect.objectContaining({ key: "eggplant|", label: "Eggplant", quantity: 3, sources: ["A", "B"] })]);
  });

  it("sorts by the shown label", () => {
    const lines = aggregateIngredients([meal("A", [ing("Zucker", 1, "g"), ing("Tomaten", 1, "g"), ing("Butter", 1, "g")])], en);
    expect(lines.map((l) => l.label)).toEqual(["Butter", "Sugar", "Tomato"]);
  });
});

describe("aggregateIngredients without a canonicaliser", () => {
  it("is the same as PLAIN_NAMES", () => {
    const meals = [meal("A", [ing("Tomaten", 200, "g"), ing("tomatoes", 100, "g")])];
    expect(aggregateIngredients(meals)).toEqual(aggregateIngredients(meals, PLAIN_NAMES));
  });

  it("keeps names, units and labels exactly as typed", () => {
    const lines = aggregateIngredients(
      [meal("A", [ing("Tomaten", 1, "EL"), ing("tomatoes", 1, "tbsp"), ing("flour", 1, "kg"), ing("flour", 500, "g")])],
      PLAIN_NAMES,
    );
    expect(lines.map((l) => [l.key, l.label, l.unit]).sort()).toEqual([
      ["flour|g", "flour", "g"],
      ["flour|kg", "flour", "kg"],
      ["tomaten|el", "Tomaten", "EL"],
      ["tomatoes|tbsp", "tomatoes", "tbsp"],
    ]);
  });
});

describe("aggregateIngredients with hand-added extras", () => {
  const flour = (quantity: number | null, unit: string | null = "g") => [meal("Bread", [ing("Mehl", quantity, unit)])];

  it("adds an extra in the same unit to the planned line", () => {
    const [line] = aggregateIngredients(flour(200), en, [{ name: "flour", quantity: 300, unit: "g" }]);
    expect(line).toMatchObject({ key: "~flour|g", quantity: 500, unit: "g" });
  });

  it("adds 2 kg to 200 g and shows 2.2 kg in English", () => {
    const lines = aggregateIngredients(flour(200), en, [{ name: "flour", quantity: 2, unit: "kg" }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 2.2, unit: "kg", label: "Flour" });
  });

  it("adds 2 kg to 200 g and shows 2.2 kg in German, where the page formats the comma", () => {
    const lines = aggregateIngredients(flour(200), de, [{ name: "flour", quantity: 2, unit: "kg" }]);
    expect(lines[0]).toMatchObject({ quantity: 2.2, unit: "kg", label: "Mehl" });
  });

  it("shows grams when the sum stays below 1000 g", () => {
    const [line] = aggregateIngredients(flour(200), en, [{ name: "flour", quantity: 0.5, unit: "kg" }]);
    expect(line).toMatchObject({ quantity: 700, unit: "g" });
  });

  it("adds nothing for an extra without an amount", () => {
    const [line] = aggregateIngredients(flour(200), en, [{ name: "flour", quantity: null, unit: "g" }]);
    expect(line).toMatchObject({ quantity: 200, unit: "g" });
  });

  it("leaves a line 'to taste' as it is", () => {
    const [line] = aggregateIngredients(flour(null), en, [{ name: "flour", quantity: 300, unit: "g" }]);
    expect(line.quantity).toBeNull();
  });

  it("ignores an extra that matches no planned line", () => {
    const lines = aggregateIngredients(flour(200), en, [{ name: "sugar", quantity: 5, unit: "g" }]);
    expect(lines.map((l) => [l.key, l.quantity])).toEqual([["~flour|g", 200]]);
  });

  it("does not add an extra in another unit", () => {
    const [line] = aggregateIngredients(flour(200), en, [{ name: "flour", quantity: 2, unit: "tbsp" }, { name: "flour", quantity: 1, unit: null }]);
    expect(line).toMatchObject({ quantity: 200, unit: "g" });
  });

  it("adds several extras", () => {
    const [line] = aggregateIngredients(flour(200), en, [
      { name: "flour", quantity: 100, unit: "g" },
      { name: "Mehl", quantity: 1, unit: "kg" },
    ]);
    expect(line).toMatchObject({ quantity: 1.3, unit: "kg" });
  });

  it("sums extras of identical name and unit without a canonicaliser", () => {
    const [line] = aggregateIngredients([meal("A", [ing("Rice", 100, "g")])], PLAIN_NAMES, [{ name: " rice ", quantity: 50, unit: "G" }]);
    expect(line).toMatchObject({ quantity: 150, unit: "g" });
  });

  it("does not match a different spelling without a canonicaliser", () => {
    const [line] = aggregateIngredients([meal("A", [ing("Tomaten", 100, "g")])], PLAIN_NAMES, [{ name: "tomatoes", quantity: 50, unit: "g" }]);
    expect(line.quantity).toBe(100);
  });

  it("is the same as before with no extras", () => {
    const meals = flour(200);
    expect(aggregateIngredients(meals, en, [])).toEqual(aggregateIngredients(meals, en));
  });
});

describe("aggregateIngredients: small amounts", () => {
  const smallOf = (meals: MealInput[], canon = en, extras: Parameters<typeof aggregateIngredients>[2] = []) =>
    Object.fromEntries(aggregateIngredients(meals, canon, extras).map((l) => [l.label, l.small]));

  it.each([
    ["99 g", 99, "g", true],
    ["100 g", 100, "g", false],
    ["0.05 kg", 0.05, "kg", true],
    ["0.2 kg", 0.2, "kg", false],
    ["0.1 kg", 0.1, "kg", false],
  ])("%s: small is %s", (_name, quantity, unit, small) => {
    expect(aggregateIngredients([meal("A", [ing("Flour", quantity, unit)])], en)[0].small).toBe(small);
  });

  it("keeps the amount on a small line, only flagging it", () => {
    expect(aggregateIngredients([meal("A", [ing("Flour", 40, "g")])], en)[0]).toMatchObject({ quantity: 40, unit: "g", small: true });
  });

  it("is not fooled by float noise: 33.3333 g three times is 99.9999 g, below 100", () => {
    expect(aggregateIngredients([meal("A", [ing("Flour", 33.3333, "g"), ing("Flour", 33.3333, "g"), ing("Flour", 33.3333, "g")])], en)[0].small).toBe(true);
  });

  it("is not fooled by float noise: ten times 10 g reaching exactly 100 is not small", () => {
    const parts = Array.from({ length: 10 }, () => ing("Flour", 10, "g"));
    expect(aggregateIngredients([meal("A", parts)], en)[0].small).toBe(false);
  });

  it("decides on the sum across recipes, not on each part", () => {
    const shown = aggregateIngredients([meal("A", [ing("Flour", 80, "g")]), meal("B", [ing("Flour", 60, "g")])], en);
    expect(shown[0]).toMatchObject({ quantity: 140, small: false });
    const dropped = aggregateIngredients([meal("A", [ing("Flour", 40, "g")]), meal("B", [ing("Flour", 30, "g")])], en);
    expect(dropped[0]).toMatchObject({ quantity: 70, small: true });
  });

  it("adds 60 g tomatoes and 50 g tomato into one shown line of 110 g", () => {
    const lines = aggregateIngredients([meal("A", [ing("tomatoes", 60, "g")]), meal("B", [ing("tomato", 50, "g")])], en);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 110, small: false });
  });

  it("decides on the scaled amount", () => {
    expect(aggregateIngredients([meal("A", [ing("Flour", 60, "g")], 4, 2)], en)[0].small).toBe(false);
    expect(aggregateIngredients([meal("A", [ing("Flour", 60, "g")], 1, 2)], en)[0].small).toBe(true);
  });

  it.each([
    ["tsp", "TL"],
    ["teaspoon", "Teelöffel"],
    ["tbsp", "EL"],
    ["tablespoons", "Esslöffel"],
    ["pinch", "Prise"],
    ["pinches", "Prisen"],
    ["dash", "Spritzer"],
    ["knife tip", "Messerspitze"],
    ["knifepoint", "Msp"],
  ])("flags %s and %s as small, even in large numbers", (english, german) => {
    for (const unit of [english, german]) {
      for (const canon of [en, de]) {
        expect(aggregateIngredients([meal("A", [ing("Salt", 500, unit)])], canon)[0].small, `${unit}`).toBe(true);
      }
    }
  });

  it("adds a spoon and its synonym into one small line", () => {
    const lines = aggregateIngredients([meal("A", [ing("Salz", 1, "TL")]), meal("B", [ing("salt", 2, "tsp")])], en);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 3, small: true });
  });

  it("never flags a line without an amount (to taste)", () => {
    expect(aggregateIngredients([meal("A", [ing("Salt", null)])], en)[0]).toMatchObject({ quantity: null, small: false });
  });

  it("keeps a line to taste when one part has no amount, and does not flag it", () => {
    const line = aggregateIngredients([meal("A", [ing("Salt", 1, "tsp"), ing("Salt", null, "tsp")])], en)[0];
    expect(line.quantity).toBeNull();
    expect(line.small).toBe(false);
  });

  it.each([
    ["piece"],
    ["clove"],
    ["cup"],
    ["ml"],
    ["l"],
  ])("never flags a small number in %s", (unit) => {
    expect(aggregateIngredients([meal("A", [ing("Thing", 1, unit)])], en)[0].small).toBe(false);
    expect(aggregateIngredients([meal("A", [ing("Thing", 0.01, unit)])], en)[0].small).toBe(false);
  });

  it("never flags a unitless count", () => {
    expect(aggregateIngredients([meal("A", [ing("Onion", 1)])], en)[0].small).toBe(false);
  });

  it("lets a hand-added extra push a small line over the limit", () => {
    const meals = [meal("A", [ing("flour", 60, "g")])];
    expect(smallOf(meals)).toEqual({ Flour: true });
    const lines = aggregateIngredients(meals, en, [{ name: "Flour", quantity: 0.5, unit: "kg" }]);
    expect(lines[0]).toMatchObject({ quantity: 560, small: false });
  });

  it("keeps a line small when the extra is small too", () => {
    const lines = aggregateIngredients([meal("A", [ing("flour", 20, "g")])], en, [{ name: "Flour", quantity: 30, unit: "g" }]);
    expect(lines[0]).toMatchObject({ quantity: 50, small: true });
  });

  it("works without a canonicaliser (plain names)", () => {
    const small = aggregateIngredients([meal("A", [ing("Flour", 99, "g"), ing("Salt", 2, "tsp")])], PLAIN_NAMES);
    expect(Object.fromEntries(small.map((l) => [l.label, l.small]))).toEqual({ Flour: true, Salt: true });
    expect(aggregateIngredients([meal("A", [ing("Flour", 100, "g")])], PLAIN_NAMES)[0].small).toBe(false);
  });

  it("defaults to the plain canonicaliser", () => {
    expect(aggregateIngredients([meal("A", [ing("Flour", 5, "g")])])[0].small).toBe(true);
  });
});
