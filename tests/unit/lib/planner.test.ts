import { describe, expect, it } from "vitest";
import { isSameDinner, matchingTag, suggestsRecipe } from "@/lib/planner";

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

describe("matchingTag", () => {
  const curry = { name: "Chickpea curry", tags: ["vegan", "quick", "one pan"] };

  it("finds the tag that makes the recipe a suggestion", () => {
    expect(matchingTag(curry, "veg")).toBe("vegan");
    expect(matchingTag(curry, "  ONE P")).toBe("one pan");
  });

  it("names the first of several matching tags", () => {
    expect(matchingTag({ name: "Soup", tags: ["quick", "quiche"] }, "qui")).toBe("quick");
  });

  it("names none when the recipe's name matches, so the name is what is shown", () => {
    expect(matchingTag(curry, "curry")).toBeNull();
    expect(matchingTag({ name: "Quick soup", tags: ["quick"] }, "quick")).toBeNull();
  });

  it("names none for nothing typed or for no match", () => {
    expect(matchingTag(curry, "")).toBeNull();
    expect(matchingTag(curry, "   ")).toBeNull();
    expect(matchingTag(curry, "pasta")).toBeNull();
    expect(matchingTag({ name: "Plain", tags: [] }, "x")).toBeNull();
  });
});
