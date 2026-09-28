import { describe, expect, it } from "vitest";
import {
  aggregateIngredients,
  formatGroceryQuantity,
  formatQuantity,
  groceryKey,
  type IngredientInput,
  type MealInput,
} from "@/lib/grocery";

const ing = (name: string, quantity: number | null, unit: string | null = null): IngredientInput => ({
  name,
  quantity,
  unit,
});

const meal = (
  recipeName: string,
  ingredients: IngredientInput[],
  { servings = 2, recipeServings = 2 }: { servings?: number; recipeServings?: number } = {},
): MealInput => ({
  servings,
  recipe: { name: recipeName, servings: recipeServings, ingredients },
});

/** A one-off dinner planned "for this day only": no recipe, nothing to buy. */
const customMeal = (servings = 2): MealInput => ({ servings, recipe: null });

describe("groceryKey", () => {
  it.each([
    ["Tomatoes", "g", "tomatoes|g"],
    ["  Tomatoes  ", " G ", "tomatoes|g"],
    ["tomatoes", null, "tomatoes|"],
    ["tomatoes", undefined, "tomatoes|"],
    ["tomatoes", "", "tomatoes|"],
    ["Olive Oil", "Tbsp", "olive oil|tbsp"],
  ])("groceryKey(%j, %j) is %j", (name, unit, expected) => {
    expect(groceryKey(name, unit)).toBe(expected);
  });

  it("keeps different units apart", () => {
    expect(groceryKey("tomatoes", "g")).not.toBe(groceryKey("tomatoes", null));
    expect(groceryKey("tomatoes", "g")).not.toBe(groceryKey("tomatoes", "kg"));
  });
});

describe("aggregateIngredients", () => {
  it("returns an empty list for no meals", () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it("skips custom meals without a recipe", () => {
    expect(aggregateIngredients([customMeal(), customMeal(4)])).toEqual([]);
  });

  it("returns an empty list for a recipe without ingredients", () => {
    expect(aggregateIngredients([meal("Toast", [])])).toEqual([]);
  });

  it("builds one line per ingredient with key, label, quantity, unit and source", () => {
    expect(aggregateIngredients([meal("Pasta", [ing("Spaghetti", 200, "g")])])).toEqual([
      { key: "spaghetti|g", label: "Spaghetti", quantity: 200, unit: "g", sources: ["Pasta"] },
    ]);
  });

  it("ignores ingredients whose name is empty or whitespace", () => {
    const lines = aggregateIngredients([meal("Pasta", [ing("", 1, "g"), ing("   ", 2), ing("Salt", null)])]);
    expect(lines.map((l) => l.label)).toEqual(["Salt"]);
  });

  it("trims the label", () => {
    const [line] = aggregateIngredients([meal("Pasta", [ing("  Basil  ", 1, "bunch")])]);
    expect(line.label).toBe("Basil");
    expect(line.key).toBe("basil|bunch");
  });

  describe("merging", () => {
    it("adds up the same ingredient with the same unit across recipes", () => {
      const lines = aggregateIngredients([
        meal("Pasta", [ing("Tomatoes", 200, "g")]),
        meal("Salad", [ing("Tomatoes", 150, "g")]),
      ]);
      expect(lines).toEqual([
        { key: "tomatoes|g", label: "Tomatoes", quantity: 350, unit: "g", sources: ["Pasta", "Salad"] },
      ]);
    });

    it("never merges the same name with a different unit", () => {
      const lines = aggregateIngredients([
        meal("Pasta", [ing("Tomatoes", 200, "g")]),
        meal("Salad", [ing("Tomatoes", 2, null)]),
        meal("Stew", [ing("Tomatoes", 1, "kg")]),
      ]);
      expect(lines).toHaveLength(3);
      expect(lines.map((l) => [l.key, l.quantity])).toEqual(
        expect.arrayContaining([
          ["tomatoes|g", 200],
          ["tomatoes|", 2],
          ["tomatoes|kg", 1],
        ]),
      );
    });

    it("never merges different names with the same unit", () => {
      const lines = aggregateIngredients([meal("Soup", [ing("Onion", 1), ing("Garlic", 1)])]);
      expect(lines).toHaveLength(2);
    });

    it("merges regardless of case and surrounding spaces, keeping the first spelling as label", () => {
      const lines = aggregateIngredients([
        meal("Pasta", [ing("Olive oil", 2, "tbsp")]),
        meal("Salad", [ing("  OLIVE OIL ", 1, " Tbsp ")]),
      ]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ label: "Olive oil", quantity: 3, unit: "tbsp", key: "olive oil|tbsp" });
    });

    it("treats a missing unit and an empty unit as the same unit", () => {
      const lines = aggregateIngredients([
        meal("A", [ing("Eggs", 2, null)]),
        meal("B", [ing("Eggs", 3, "")]),
      ]);
      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBe(5);
    });

    it("merges duplicates within one recipe and lists the recipe once", () => {
      const lines = aggregateIngredients([meal("Pizza", [ing("Cheese", 100, "g"), ing("Cheese", 50, "g")])]);
      expect(lines).toEqual([
        { key: "cheese|g", label: "Cheese", quantity: 150, unit: "g", sources: ["Pizza"] },
      ]);
    });

    it("lists a recipe planned on several days once in the sources but counts it each time", () => {
      const pasta = meal("Pasta", [ing("Spaghetti", 200, "g")]);
      const lines = aggregateIngredients([pasta, pasta, pasta]);
      expect(lines[0]).toMatchObject({ quantity: 600, sources: ["Pasta"] });
    });

    it("keeps the sources in the order the meals come in", () => {
      const lines = aggregateIngredients([
        meal("Zucchini bake", [ing("Salt", 1, "tsp")]),
        meal("Apple pie", [ing("Salt", 1, "tsp")]),
      ]);
      expect(lines[0].sources).toEqual(["Zucchini bake", "Apple pie"]);
    });
  });

  describe("to taste", () => {
    it("keeps a single unquantified ingredient at null", () => {
      const [line] = aggregateIngredients([meal("Soup", [ing("Salt", null)])]);
      expect(line.quantity).toBeNull();
    });

    it.each([
      ["quantified first", [ing("Pepper", 1, "tsp"), ing("Pepper", null, "tsp")]],
      ["unquantified first", [ing("Pepper", null, "tsp"), ing("Pepper", 1, "tsp")]],
      ["unquantified in the middle", [ing("Pepper", 1, "tsp"), ing("Pepper", null, "tsp"), ing("Pepper", 2, "tsp")]],
    ])("one unquantified source makes the whole line null (%s)", (_, ingredients) => {
      const lines = aggregateIngredients(ingredients.map((i, n) => meal(`Recipe ${n}`, [i])));
      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBeNull();
      expect(lines[0].sources).toHaveLength(ingredients.length);
    });

    it("does not make other lines unquantified", () => {
      const lines = aggregateIngredients([meal("Soup", [ing("Salt", null), ing("Carrots", 3)])]);
      expect(lines.find((l) => l.label === "Carrots")?.quantity).toBe(3);
    });

    it("keeps a zero quantity as 0, not as to taste", () => {
      const [line] = aggregateIngredients([meal("Soup", [ing("Salt", 0, "g")])]);
      expect(line.quantity).toBe(0);
    });

    it("shows a merged line with an unquantified source as \"to taste\", even with a unit", () => {
      const [line] = aggregateIngredients([
        meal("Bread", [ing("Flour", 500, "g")]),
        meal("Sauce", [ing("Flour", null, "g")]),
      ]);
      expect(formatGroceryQuantity(line)).toBe("to taste");
    });

    it("shows a quantified grocery line like formatQuantity", () => {
      expect(formatGroceryQuantity({ quantity: 1.5, unit: "kg", sources: ["Soup"] })).toBe("1.5 kg");
      expect(formatGroceryQuantity({ quantity: 2, unit: null, sources: [] })).toBe("2");
    });

    it("keeps the unit of a hand-added extra without an amount", () => {
      expect(formatGroceryQuantity({ quantity: null, unit: "bottles", sources: [] })).toBe("bottles");
      expect(formatGroceryQuantity({ quantity: null, unit: null, sources: [] })).toBe("to taste");
    });
  });

  describe("scaling by servings", () => {
    it.each([
      [2, 2, 200, 200, "same servings"],
      [3, 2, 200, 300, "recipe for 2 planned for 3 → 1.5x"],
      [1, 4, 200, 50, "recipe for 4 planned for 1 → 0.25x"],
      [4, 2, 1.5, 3, "decimal quantities"],
      [1, 3, 1, 1 / 3, "a third"],
      [0, 2, 200, 0, "zero servings planned"],
    ])(
      "planned %i, recipe %i, quantity %d → %d (%s)",
      (servings, recipeServings, quantity, expected) => {
        const [line] = aggregateIngredients([meal("R", [ing("X", quantity, "g")], { servings, recipeServings })]);
        expect(line.quantity).toBeCloseTo(expected, 10);
      },
    );

    it.each([0, -2])("treats a recipe with %i servings as serving 1, instead of dividing by it", (recipeServings) => {
      const [line] = aggregateIngredients([meal("R", [ing("X", 100, "g")], { servings: 3, recipeServings })]);
      expect(line.quantity).toBe(300);
      expect(Number.isFinite(line.quantity)).toBe(true);
    });

    it("scales each meal by its own servings before merging", () => {
      const lines = aggregateIngredients([
        meal("Pasta", [ing("Tomatoes", 200, "g")], { servings: 4, recipeServings: 2 }), // 400
        meal("Salad", [ing("Tomatoes", 100, "g")], { servings: 1, recipeServings: 4 }), // 25
      ]);
      expect(lines[0].quantity).toBe(425);
    });

    it("does not scale an unquantified ingredient", () => {
      const [line] = aggregateIngredients([meal("R", [ing("Salt", null)], { servings: 6, recipeServings: 2 })]);
      expect(line.quantity).toBeNull();
    });
  });

  describe("sorting", () => {
    it("sorts lines alphabetically by label, ignoring case", () => {
      const lines = aggregateIngredients([
        meal("R", [ing("carrots", 1), ing("Apples", 1), ing("bananas", 1), ing("Zucchini", 1)]),
      ]);
      expect(lines.map((l) => l.label)).toEqual(["Apples", "bananas", "carrots", "Zucchini"]);
    });
  });

  it("does not modify its input", () => {
    const meals = [meal("Pasta", [ing("Tomatoes", 200, "g")]), meal("Salad", [ing("Tomatoes", 100, "g")])];
    const snapshot = structuredClone(meals);
    aggregateIngredients(meals);
    expect(meals).toEqual(snapshot);
  });
});

describe("formatQuantity", () => {
  it.each([
    [2, null, "2"],
    [2.0, "g", "2 g"],
    [1.5, "kg", "1.5 kg"],
    [1 / 3, "cup", "0.33 cup"],
    [2 / 3, null, "0.67"],
    [0.1 + 0.2, "l", "0.3 l"],
    [0.005, "kg", "0.01 kg"],
    [0.004, "kg", "0 kg"],
    [1234.5678, "g", "1234.57 g"],
    [0, "g", "0 g"],
    [0, null, "0"],
    [1e6, "g", "1000000 g"],
  ])("formatQuantity(%d, %j) is %j", (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected);
  });

  it("uses a decimal point, not a comma", () => {
    expect(formatQuantity(2.5, null)).toBe("2.5");
  });

  it.each([
    [null, null, "to taste"],
    [null, "", "to taste"],
    [null, "pinch", "pinch"],
  ])("formatQuantity(%j, %j) is %j", (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected);
  });

  it("treats an empty unit like no unit", () => {
    expect(formatQuantity(3, "")).toBe("3");
  });
});
