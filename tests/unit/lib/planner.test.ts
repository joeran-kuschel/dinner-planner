import { describe, expect, it } from "vitest";
import { isSameDinner, suggestsRecipe } from "@/lib/planner";

describe("isSameDinner", () => {
  it.each([
    ["Mushroom risotto", "Mushroom risotto"],
    ["Mushroom risotto", "mushroom RISOTTO"],
    ["Mushroom risotto", "  Mushroom risotto  "],
    ["Käsespätzle", "KÄSESPÄTZLE"],
  ])("treats %j and %j as the same dinner", (recipe, typed) => {
    expect(isSameDinner(recipe, typed)).toBe(true);
  });

  it.each([
    ["Mushroom risotto", "Mushroom"],
    ["Mushroom risotto", "Mushroom  risotto"],
    ["Mushroom risotto", ""],
  ])("tells %j and %j apart", (recipe, typed) => {
    expect(isSameDinner(recipe, typed)).toBe(false);
  });
});

describe("suggestsRecipe", () => {
  it.each(["Mush", "risotto", "ROOM RIS", "  risotto ", "Mushroom risotto"])(
    "suggests “Mushroom risotto” for %j",
    (typed) => {
      expect(suggestsRecipe("Mushroom risotto", typed)).toBe(true);
    },
  );

  it("suggests every recipe while nothing is typed", () => {
    expect(suggestsRecipe("Mushroom risotto", "")).toBe(true);
    expect(suggestsRecipe("Mushroom risotto", "   ")).toBe(true);
  });

  it("does not suggest a recipe that does not contain the text", () => {
    expect(suggestsRecipe("Mushroom risotto", "curry")).toBe(false);
  });
});
