import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { commonUnits, mergeUnits, unitSuggestions } from "@/lib/units";
import { testI18n } from "@/tests/support/i18n";

const en = testI18n("en");
const de = testI18n("de");
const COMMON = ["g", "kg", "ml", "l", "tbsp", "tsp", "cup", "piece", "pinch", "clove"];

describe("commonUnits", () => {
  it("are the ten units of a kitchen in English", () => {
    expect(commonUnits(en)).toEqual(COMMON);
  });

  it("are translated into German", () => {
    expect(commonUnits(de)).toEqual(["g", "kg", "ml", "l", "EL", "TL", "Tasse", "Stück", "Prise", "Zehe"]);
  });
});

describe("mergeUnits", () => {
  it("starts with the common units", () => {
    expect(mergeUnits([], en)).toEqual(COMMON);
  });

  it("adds units in use after them, once and ignoring case and blanks", () => {
    expect(mergeUnits(["bunch", "G", "Bunch", " ", " can "], en)).toEqual([...COMMON, "bunch", "can"]);
  });

  it("does not repeat a German common unit that a recipe also uses", () => {
    expect(mergeUnits(["el", "Dose"], de)).toContain("Dose");
    expect(mergeUnits(["el", "Dose"], de).filter((unit) => unit.toLowerCase() === "el")).toEqual(["EL"]);
  });
});

describe("unitSuggestions", () => {
  it("offers the units that recipes use besides the common ones", async () => {
    await prisma.recipe.create({
      data: {
        name: "Stew",
        servings: 2,
        ingredients: {
          create: [
            { name: "Beans", quantity: 1, unit: "can" },
            { name: "Rice", quantity: 100, unit: "g" },
            { name: "Salt", quantity: null, unit: null },
          ],
        },
      },
    });
    expect(await unitSuggestions(en)).toEqual([...COMMON, "can"]);
  });

  it("is just the common units without any recipe", async () => {
    expect(await unitSuggestions(en)).toEqual(COMMON);
  });
});
