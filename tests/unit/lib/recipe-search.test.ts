import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  readRecipeSearch,
  recipeHref,
  recipeListHref,
  recipeSearchWhere,
  searchTerms,
  searchWords,
  tagNames,
  type RecipeSearch,
} from "@/lib/recipe-search";

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

  it("finds a recipe by two words that are both its tags", async () => {
    expect(await find({ text: "vegetarian quick" })).toEqual(["Shakshuka"]);
    expect(await find({ text: "quick, vegan" })).toEqual(["Red Lentil Dal"]);
  });

  it("needs every word, so one that matches nothing finds nothing", async () => {
    expect(await find({ text: "quick sushi" })).toEqual([]);
  });

  it("finds a multi-word title, tag or ingredient typed in full", async () => {
    await seed(
      "Spring onion soup",
      ["one pot"],
      ["Spring onions", "Stock cube"],
    );
    expect(await find({ text: "spring onion soup" })).toEqual([
      "Spring onion soup",
    ]);
    expect(await find({ text: "one pot" })).toEqual(["Spring onion soup"]);
    expect(await find({ text: "stock cube" })).toEqual(["Spring onion soup"]);
  });

  it("finds a recipe with two multi-word tags by the words of both", async () => {
    await seed("Chilli", ["one pot", "slow cooker"]);
    await seed("Stew", ["one pot"]);
    expect(await find({ text: "one pot slow cooker" })).toEqual(["Chilli"]);
  });

  it("keeps a quoted phrase as one word", async () => {
    await seed("Chilli", ["one pot", "quick"]);
    await seed("Pot roast", ["one"]);
    expect(await find({ text: '"one pot" quick' })).toEqual(["Chilli"]);
    expect(await find({ text: '"one pot"' })).toEqual(["Chilli"]);
  });

  it("lets the words match different fields", async () => {
    expect(await find({ text: "dal quick" })).toEqual(["Red Lentil Dal"]);
    expect(await find({ text: "eggs vegetarian shakshuka" })).toEqual([
      "Shakshuka",
    ]);
    expect(await find({ text: "lemon meat" })).toEqual(["Roast Chicken"]);
  });

  it("escapes wildcard characters in every word", async () => {
    await seed("100% oat porridge", ["sweet"]);
    expect(await find({ text: "100% sweet" })).toEqual(["100% oat porridge"]);
    expect(await find({ text: "% sweet" })).toEqual(["100% oat porridge"]);
    expect(await find({ text: "_ sweet" })).toEqual([]);
    expect(await find({ text: "quick _" })).toEqual([]);
  });

  it("does not match everything for quotes or commas alone", async () => {
    expect(await find({ text: '""' })).toEqual([]);
    expect(await find({ text: "," })).toEqual([]);
  });

  it("combines several words with the tag filter", async () => {
    expect(await find({ text: "dal lentils", tags: ["quick"] })).toEqual([
      "Red Lentil Dal",
    ]);
    expect(await find({ text: "dal lentils", tags: ["vegetarian"] })).toEqual(
      [],
    );
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

describe("searchWords", () => {
  it("splits on spaces and commas and keeps a quoted phrase whole", () => {
    expect(searchWords('one  pot,quick "slow cooker"')).toEqual([
      "one",
      "pot",
      "quick",
      "slow cooker",
    ]);
  });

  it("drops blanks and repeats, and an unclosed quote is plain text", () => {
    expect(searchWords(' a, ,A a "" "b')).toEqual(["a", "A", "b"]);
  });

  it("reads at most ten words, each at most a hundred characters", () => {
    expect(
      searchWords(Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ")),
    ).toHaveLength(10);
    expect(searchWords("x".repeat(300))[0]).toHaveLength(100);
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

describe("recipeListHref and recipeHref", () => {
  it("build plain addresses when nothing filters", () => {
    expect(recipeListHref({ text: "", tags: [] })).toBe("/recipes");
    expect(recipeHref("abc", { text: "", tags: [] })).toBe("/recipes/abc");
  });

  it("carry the word and every tag, encoded", () => {
    const search = { text: "mac & cheese", tags: ["quick", "tex mex"] };
    expect(recipeListHref(search)).toBe("/recipes?q=mac+%26+cheese&tag=quick&tag=tex+mex");
    expect(recipeHref("abc", search)).toBe("/recipes/abc?q=mac+%26+cheese&tag=quick&tag=tex+mex");
  });

  it("round-trip through readRecipeSearch", () => {
    const search = { text: "ü & %", tags: ["quick", "tex mex"] };
    const params = new URLSearchParams(recipeListHref(search).split("?")[1]);
    expect(readRecipeSearch({ q: params.get("q") ?? undefined, tag: params.getAll("tag") })).toEqual(search);
  });
});
