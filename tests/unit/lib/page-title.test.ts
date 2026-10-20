import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { absoluteTitle, MAX_TITLE_LENGTH, recipeTitle, shortenTitle, TITLE_SEPARATOR } from "@/lib/page-title";
import { testI18n } from "@/tests/support/i18n";

describe("shortenTitle", () => {
  it.each([
    ["a short name stays as it is", "Soup", "Soup"],
    ["an empty name stays empty", "", ""],
    ["surrounding whitespace is trimmed", "  Soup \n", "Soup"],
    ["runs of whitespace collapse to one space", "Tomato \t\n  soup", "Tomato soup"],
    ["HTML characters stay plain text", "<b>Mac & \"Cheese\"</b>", "<b>Mac & \"Cheese\"</b>"],
  ])("%s", (_name, input, expected) => {
    expect(shortenTitle(input)).toBe(expected);
  });

  it("keeps a name of exactly 60 characters", () => {
    const name = "a".repeat(MAX_TITLE_LENGTH);
    expect(shortenTitle(name)).toBe(name);
  });

  it("cuts a name of 61 characters to 60, ending in an ellipsis", () => {
    const shortened = shortenTitle("a".repeat(MAX_TITLE_LENGTH + 1));
    expect(shortened).toBe(`${"a".repeat(MAX_TITLE_LENGTH - 1)}…`);
    expect(Array.from(shortened)).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("counts after collapsing whitespace", () => {
    const name = `${"a".repeat(29)}${" ".repeat(20)}${"b".repeat(30)}`;
    expect(shortenTitle(name)).toBe(`${"a".repeat(29)} ${"b".repeat(30)}`);
  });

  it("does not split an emoji when cutting", () => {
    const shortened = shortenTitle("🍕".repeat(70));
    expect(shortened).toBe(`${"🍕".repeat(MAX_TITLE_LENGTH - 1)}…`);
    expect(shortened).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("leaves no space before the ellipsis", () => {
    expect(shortenTitle(`${"a".repeat(58)} ${"b".repeat(10)}`)).toBe(`${"a".repeat(58)}…`);
  });
});

describe("absoluteTitle", () => {
  it("adds the app name in English", () => {
    expect(absoluteTitle("Week plan", testI18n("en"))).toEqual({ absolute: `Week plan${TITLE_SEPARATOR}Dinner Planner` });
  });

  it("adds the app name in German", () => {
    expect(absoluteTitle("Wochenplan", testI18n("de"))).toEqual({ absolute: "Wochenplan - Abendessen-Planer" });
  });
});

describe("recipeTitle", () => {
  it("returns the recipe's name", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "Lentil soup" } });
    expect(await recipeTitle(recipe.id)).toBe("Lentil soup");
  });

  it("shortens a long name", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "x".repeat(100) } });
    expect(await recipeTitle(recipe.id)).toBe(`${"x".repeat(59)}…`);
  });

  it("returns null for an unknown id", async () => {
    expect(await recipeTitle("does-not-exist")).toBeNull();
  });

  it("returns null once the recipe is deleted", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "Gone" } });
    await prisma.recipe.delete({ where: { id: recipe.id } });
    expect(await recipeTitle(recipe.id)).toBeNull();
  });
});
