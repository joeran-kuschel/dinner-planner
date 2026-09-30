import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { readRecipeSearch, recipeSearchWhere, searchTerms, tagNames, type RecipeSearch } from "@/lib/recipe-search";

describe("readRecipeSearch", () => {
  it("reads the word and the tags from the address parameters", () => {
    expect(readRecipeSearch({ q: "  lentil ", tag: ["Quick", "vegan"] })).toEqual({
      text: "lentil",
      tags: ["quick", "vegan"],
    });
  });

  it("accepts a single tag, which is a string rather than a list", () => {
    expect(readRecipeSearch({ tag: "Quick" })).toEqual({ text: "", tags: ["quick"] });
  });

  it("drops NUL characters, which Postgres refuses, instead of failing", () => {
    expect(readRecipeSearch({ q: "le\u0000ntil", tag: ["qu\u0000ick", "\u0000"] })).toEqual({
      text: "lentil",
      tags: ["quick"],
    });
  });

  it("reads at most a hundred characters of the word, ten tags, and no tag over thirty characters", () => {
    const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    const search = readRecipeSearch({ q: "x".repeat(300), tag: [...tags, "y".repeat(31)] });
    expect(search.text).toHaveLength(100);
    expect(search.tags).toEqual(tags.slice(0, 10));
    expect(readRecipeSearch({ tag: ["y".repeat(31)] }).tags).toEqual([]);
  });

  it("finds nothing, and does not fail, for a word with a NUL character", async () => {
    const where = recipeSearchWhere(readRecipeSearch({ q: "\u0000", tag: "\u0000" }));
    await expect(prisma.recipe.findMany({ where })).resolves.toEqual([]);
  });

  it("ignores repeated, blank or missing values", () => {
    expect(readRecipeSearch({ q: ["a", "b"], tag: ["quick", "Quick ", "", "  "] })).toEqual({
      text: "",
      tags: ["quick"],
    });
    expect(readRecipeSearch({})).toEqual({ text: "", tags: [] });
  });
});

async function seed(name: string, tags: string[], ingredients: string[] = []) {
  await prisma.recipe.create({
    data: {
      name,
      tags: { connectOrCreate: tags.map((tag) => ({ where: { name: tag }, create: { name: tag } })) },
      ingredients: { create: ingredients.map((ingredient, position) => ({ name: ingredient, position })) },
    },
  });
}

async function find(search: Partial<RecipeSearch>): Promise<string[]> {
  const recipes = await prisma.recipe.findMany({
    where: recipeSearchWhere({ text: "", tags: [], ...search }),
    orderBy: { name: "asc" },
  });
  return recipes.map((recipe) => recipe.name);
}

describe("recipeSearchWhere", () => {
  beforeEach(async () => {
    await seed("Red Lentil Dal", ["vegan", "quick", "freezer-friendly"], ["Red lentils", "Coconut milk"]);
    await seed("Shakshuka", ["vegetarian", "quick"], ["Eggs", "Chopped tomatoes"]);
    await seed("Roast Chicken", ["meat"], ["Chicken thighs", "Lemon"]);
  });

  it("finds everything without a search", async () => {
    expect(await find({})).toEqual(["Red Lentil Dal", "Roast Chicken", "Shakshuka"]);
  });

  it("matches a part of the name, ignoring case", async () => {
    expect(await find({ text: "LENT" })).toEqual(["Red Lentil Dal"]);
  });

  it("matches a tag", async () => {
    expect(await find({ text: "freezer" })).toEqual(["Red Lentil Dal"]);
  });

  it("matches an ingredient", async () => {
    expect(await find({ text: "tomato" })).toEqual(["Shakshuka"]);
    expect(await find({ text: "COCONUT" })).toEqual(["Red Lentil Dal"]);
  });

  it("matches a recipe once even when the word is in its name, tag and ingredient", async () => {
    await seed("Lemon cake", ["lemon"], ["Lemon"]);
    expect(await find({ text: "lemon" })).toEqual(["Lemon cake", "Roast Chicken"]);
  });

  it("filters by one tag", async () => {
    expect(await find({ tags: ["quick"] })).toEqual(["Red Lentil Dal", "Shakshuka"]);
  });

  it("needs all the chosen tags", async () => {
    expect(await find({ tags: ["quick", "vegan"] })).toEqual(["Red Lentil Dal"]);
    expect(await find({ tags: ["vegan", "vegetarian"] })).toEqual([]);
  });

  it("matches a tag exactly, not by a part of it", async () => {
    expect(await find({ tags: ["veg"] })).toEqual([]);
  });

  it("combines the word and the tags", async () => {
    expect(await find({ text: "egg", tags: ["quick"] })).toEqual(["Shakshuka"]);
    expect(await find({ text: "egg", tags: ["vegan"] })).toEqual([]);
  });

  it("finds nothing for an unknown word or tag", async () => {
    expect(await find({ text: "sushi" })).toEqual([]);
    expect(await find({ tags: ["sushi"] })).toEqual([]);
  });

  it("finds a wildcard character where it is really in a name", async () => {
    await seed("100% oat porridge", []);
    await seed("snake_case stew", []);
    expect(await find({ text: "%" })).toEqual(["100% oat porridge"]);
    expect(await find({ text: "e_c" })).toEqual(["snake_case stew"]);
  });

  it("treats the characters of a SQL pattern as plain text", async () => {
    expect(await find({ text: "%" })).toEqual([]);
    expect(await find({ text: "_" })).toEqual([]);
    expect(await find({ text: "r_d" })).toEqual([]);
    expect(await find({ text: "\\" })).toEqual([]);
    expect(await find({ text: "'; drop table \"Recipe\"; --" })).toEqual([]);
  });
});

describe("tagNames", () => {
  it("lists the tags in use in alphabetical order", async () => {
    await seed("A", ["zebra", "apple"]);
    await seed("B", ["apple", "mango"]);
    expect(await tagNames()).toEqual(["apple", "mango", "zebra"]);
  });

  it("is empty without tags", async () => {
    expect(await tagNames()).toEqual([]);
  });
});

describe("searchTerms", () => {
  it("lists recipe names, tags and ingredient names, once each", async () => {
    await seed("Lentil soup", ["vegan", "quick"], ["Lentils", "Carrot"]);
    await seed("Carrot cake", ["sweet"], ["Carrot", "Flour"]);

    expect(await searchTerms()).toEqual([
      { text: "Carrot cake", kind: "recipe" },
      { text: "Lentil soup", kind: "recipe" },
      { text: "quick", kind: "tag" },
      { text: "sweet", kind: "tag" },
      { text: "vegan", kind: "tag" },
      { text: "Carrot", kind: "ingredient" },
      { text: "Flour", kind: "ingredient" },
      { text: "Lentils", kind: "ingredient" },
    ]);
  });

  it("lists a word once, as the first kind it is, whatever its case", async () => {
    await seed("Lemon", ["lemon"], ["LEMON", "lemon "]);
    expect(await searchTerms()).toEqual([{ text: "Lemon", kind: "recipe" }]);
  });

  it("is empty without recipes", async () => {
    expect(await searchTerms()).toEqual([]);
  });
});
