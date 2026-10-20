import { beforeEach, describe, expect, it, vi } from "vitest";

// The language comes from the cookie / Accept-Language header, as in a real request.
const request = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "locale" ? { value: request.locale } : undefined) }),
  headers: async () => new Headers(),
}));

// The layout loads its fonts at build time; a stand-in is enough here.
vi.mock("next/font/google", () => ({ Hanken_Grotesk: () => ({ variable: "" }), Fraunces: () => ({ variable: "" }) }));

import { generateMetadata as layoutMetadata } from "@/app/layout";
import { generateMetadata as groceriesMetadata } from "@/app/groceries/page";
import { generateMetadata as weekPlanMetadata } from "@/app/page";
import { generateMetadata as editMetadata } from "@/app/recipes/[id]/edit/page";
import { generateMetadata as recipeMetadata } from "@/app/recipes/[id]/page";
import { generateMetadata as newRecipeMetadata } from "@/app/recipes/new/page";
import { generateMetadata as recipesMetadata } from "@/app/recipes/page";
import { prisma } from "@/lib/db";

/** What Next puts in the tab: a page's own title run through the layout's template. */
async function tabTitle(title: unknown): Promise<string> {
  const { title: layout } = await layoutMetadata();
  const { template, default: fallback } = layout as { template: string; default: string };
  if (title === undefined) return fallback;
  if (typeof title === "object" && title && "absolute" in title) return (title as { absolute: string }).absolute;
  return template.replace("%s", title as string);
}

const props = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) }) as never;

describe.each([
  ["en", { app: "Dinner Planner", plan: "Week plan", recipes: "Recipes", add: "New recipe", groceries: "Grocery list" }],
  ["de", { app: "Abendessen-Planer", plan: "Wochenplan", recipes: "Rezepte", add: "Neues Rezept", groceries: "Einkaufsliste" }],
])("page titles in %s", (locale, text) => {
  beforeEach(() => {
    request.locale = locale;
  });

  it("the layout's template puts the app name after the page's part", async () => {
    const { title } = await layoutMetadata();
    expect(title).toEqual({ default: text.app, template: `%s - ${text.app}` });
  });

  it.each([
    ["recipes", () => recipesMetadata(), "recipes"],
    ["new recipe", () => newRecipeMetadata(), "add"],
    ["grocery list", () => groceriesMetadata(), "groceries"],
  ] as const)("%s", async (_name, metadata, key) => {
    const { title } = await metadata();
    expect(await tabTitle(title)).toBe(`${text[key]} - ${text.app}`);
  });

  it("the week plan carries the whole title itself, since the template skips its own segment", async () => {
    const { title } = await weekPlanMetadata();
    expect(title).toEqual({ absolute: `${text.plan} - ${text.app}` });
    expect(await tabTitle(title)).toBe(`${text.plan} - ${text.app}`);
  });

  it("a recipe is titled with its name", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "Lentil soup" } });
    expect(await tabTitle((await recipeMetadata(props({ id: recipe.id }))).title)).toBe(`Lentil soup - ${text.app}`);
  });

  it("a long recipe name is shortened", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "y".repeat(80) } });
    const { title } = await recipeMetadata(props({ id: recipe.id }));
    expect(title).toBe(`${"y".repeat(59)}…`);
  });

  it("the edit page says it edits the recipe", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "Lentil soup" } });
    const expected = locale === "en" ? "Edit Lentil soup" : "Lentil soup bearbeiten";
    expect(await tabTitle((await editMetadata(props({ id: recipe.id }))).title)).toBe(`${expected} - ${text.app}`);
  });

  it("an unknown recipe keeps the bare app name on both pages", async () => {
    const detail = await recipeMetadata(props({ id: "nope" }));
    const edit = await editMetadata(props({ id: "nope" }));
    expect(detail).toEqual({});
    expect(edit).toEqual({});
    expect(await tabTitle((detail as { title?: unknown }).title)).toBe(text.app);
  });
});
