import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "@/lib/recipe-import/ingredient";

const row = (line: string) => {
  const { name, quantity, unit } = parseIngredientLine(line);
  return [quantity, unit, name];
};

describe("parseIngredientLine", () => {
  it.each([
    ["200 g flour", ["200", "g", "flour"]],
    ["200g flour", ["200", "g", "flour"]],
    ["1.5 kg potatoes", ["1.5", "kg", "potatoes"]],
    ["1,5 l milk", ["1.5", "l", "milk"]],
    ["2 tablespoons olive oil", ["2", "tbsp", "olive oil"]],
    ["1 tsp. salt", ["1", "tsp", "salt"]],
    ["3 cups water", ["3", "cup", "water"]],
    ["2 eggs", ["2", "", "eggs"]],
    ["1 large onion", ["1", "", "large onion"]],
    ["3 cloves of garlic", ["3", "clove", "garlic"]],
    ["1 can (400 g) chopped tomatoes", ["1", "can", "chopped tomatoes"]],
    ["8 oz cream cheese", ["8", "oz", "cream cheese"]],
  ])("reads %j (English)", (line, expected) => expect(row(line)).toEqual(expected));

  it.each([
    ["200 g Mehl", ["200", "g", "Mehl"]],
    ["1 EL Olivenöl", ["1", "EL", "Olivenöl"]],
    ["2 Esslöffel Zucker", ["2", "EL", "Zucker"]],
    ["½ TL Salz", ["0.5", "TL", "Salz"]],
    ["2 Zehen Knoblauch", ["2", "Zehe", "Knoblauch"]],
    ["1 Dose Tomaten", ["1", "Dose", "Tomaten"]],
    ["1 Bund Petersilie", ["1", "Bund", "Petersilie"]],
    ["1 Prise Salz", ["1", "Prise", "Salz"]],
    ["3 Eier", ["3", "", "Eier"]],
  ])("reads %j (German)", (line, expected) => expect(row(line)).toEqual(expected));

  it.each([
    ["½ cup sugar", ["0.5", "cup", "sugar"]],
    ["1½ cups flour", ["1.5", "cup", "flour"]],
    ["1 1/2 cups flour", ["1.5", "cup", "flour"]],
    ["3/4 tsp pepper", ["0.75", "tsp", "pepper"]],
    ["⅓ cup honey", ["0.333", "cup", "honey"]],
  ])("reads the fraction in %j", (line, expected) => expect(row(line)).toEqual(expected));

  it.each([
    ["2-3 cloves garlic", ["3", "clove", "garlic"]],
    ["2–3 Zehen Knoblauch", ["3", "Zehe", "Knoblauch"]],
    ["1 to 2 tbsp butter", ["2", "tbsp", "butter"]],
  ])("shops a range such as %j for its upper end", (line, expected) => expect(row(line)).toEqual(expected));

  it.each([
    ["a pinch of salt", ["", "", "a pinch of salt"]],
    ["pinch of salt", ["", "pinch", "salt"]],
    ["Prise Zucker", ["", "Prise", "Zucker"]],
    ["salt, to taste", ["", "", "salt"]],
    ["Salz und Pfeffer", ["", "", "Salz und Pfeffer"]],
  ])("keeps %j without an amount for \"to taste\"", (line, expected) => expect(row(line)).toEqual(expected));

  it("drops preparation notes after a comma and bracketed notes from the name", () => {
    expect(row("2 cloves garlic, finely chopped")).toEqual(["2", "clove", "garlic"]);
    expect(row("100 g butter (softened)")).toEqual(["100", "g", "butter"]);
    expect(row("1 onion; diced")).toEqual(["1", "", "onion"]);
  });

  it("does not take an ordinary word for a unit", () => {
    expect(row("2 large eggs")).toEqual(["2", "", "large eggs"]);
    expect(row("1 Stück Ingwer")).toEqual(["1", "Stück", "Ingwer"]);
    // A unit word without an amount is part of the name, not a unit.
    expect(row("Bund Radieschen")).toEqual(["", "", "Bund Radieschen"]);
  });

  it("strips a bullet and odd spaces", () => {
    expect(row("•  200 g   flour")).toEqual(["200", "g", "flour"]);
    expect(row("- 2 eggs")).toEqual(["2", "", "eggs"]);
  });

  it("keeps the whole line as the name when nothing is left after the amount", () => {
    expect(row("2 g")).toEqual(["2", "g", "2 g"]);
    expect(row("(optional)")).toEqual(["", "", "(optional)"]);
  });

  it("files every row under Other and caps a very long name", () => {
    expect(parseIngredientLine("1 apple").category).toBe("OTHER");
    expect(parseIngredientLine(`1 ${"x".repeat(300)}`).name).toHaveLength(120);
  });

  it("treats a zero amount as no amount", () => {
    expect(row("0 g sugar")).toEqual(["", "g", "sugar"]);
  });
});

describe("hostile ingredient lines", () => {
  it.each([["(", "(".repeat(200_000)], ["numbers", "1 ".repeat(100_000)], ["brackets", "(a".repeat(100_000)], ["fractions", "1/".repeat(100_000)]])(
    "reads 200 KB of %s in a moment",
    (_label, line) => {
      const started = performance.now();
      const { name } = parseIngredientLine(line);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(name.length).toBeLessThanOrEqual(120);
    },
  );

  it("leaves a very long line cut short, not rejected", () => {
    expect(parseIngredientLine(`2 g ${"x".repeat(5_000)}`)).toMatchObject({ quantity: "2", unit: "g" });
  });
});
