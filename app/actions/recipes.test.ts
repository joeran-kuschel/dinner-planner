import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { EMPTY_RECIPE_FORM_STATE, type RecipeFormState } from "@/lib/recipe-form";
import { addDays, parseDayKey } from "@/lib/week";
import { formData } from "@/test/db";
import { expectRedirect, RedirectError } from "@/test/next";
import { createRecipe, deleteRecipe, updateRecipe } from "./recipes";

const MONDAY = parseDayKey("2026-09-28")!;

type Fields = Record<string, string | string[]>;

/** A complete, valid recipe form as the browser posts it. */
function recipeForm(overrides: Fields = {}): FormData {
  return formData({
    name: "Tomato soup",
    description: "Quick and warming",
    servings: "4",
    prepMinutes: "25",
    sourceUrl: "https://example.com/soup",
    instructions: "Chop\nSimmer",
    ingredientName: ["Tomatoes", "Onion"],
    ingredientQuantity: ["800", "1"],
    ingredientUnit: ["g", ""],
    ...overrides,
  });
}

async function onlyRecipe() {
  const recipes = await prisma.recipe.findMany({
    include: { ingredients: { orderBy: { position: "asc" } } },
  });
  expect(recipes).toHaveLength(1);
  return recipes[0];
}

/** Submit the create form, expect it to end in a redirect and return the target. */
async function submitCreate(form: FormData): Promise<string> {
  const outcome = await createRecipe(EMPTY_RECIPE_FORM_STATE, form).then(
    (state) => state,
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(RedirectError);
  const url = (outcome as RedirectError).url;
  expect(url).toMatch(/^\/recipes\/[^/]+$/);
  return url;
}

function expectRecipeViewsRevalidated() {
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/"], ["/recipes"], ["/groceries"]]);
}

async function seedRecipe(name = "Old name") {
  return prisma.recipe.create({
    data: {
      name,
      servings: 2,
      ingredients: {
        create: [
          { name: "Old A", quantity: 1, unit: "g", position: 0 },
          { name: "Old B", quantity: 2, unit: null, position: 1 },
        ],
      },
    },
  });
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(redirect).mockClear();
});

describe("createRecipe", () => {
  it("creates the recipe with its ingredients, revalidates and redirects to it", async () => {
    const redirectedTo = await submitCreate(recipeForm());

    const recipe = await onlyRecipe();
    expect(redirectedTo).toBe(`/recipes/${recipe.id}`);
    expect(recipe).toMatchObject({
      name: "Tomato soup",
      description: "Quick and warming",
      servings: 4,
      prepMinutes: 25,
      sourceUrl: "https://example.com/soup",
      instructions: "Chop\nSimmer",
    });
    expect(recipe.ingredients.map(({ name, quantity, unit, position }) => ({ name, quantity, unit, position }))).toEqual([
      { name: "Tomatoes", quantity: 800, unit: "g", position: 0 },
      { name: "Onion", quantity: 1, unit: null, position: 1 },
    ]);
    expectRecipeViewsRevalidated();
  });

  it("trims every text field and stores blank optional fields as null", async () => {
    await submitCreate(
      recipeForm({
        name: "  Soup  ",
        description: "   ",
        prepMinutes: "",
        sourceUrl: "  ",
        instructions: "\n\n",
        ingredientName: ["  Salt "],
        ingredientQuantity: [""],
        ingredientUnit: ["  "],
      }),
    );

    const recipe = await onlyRecipe();
    expect(recipe).toMatchObject({
      name: "Soup",
      description: null,
      prepMinutes: null,
      sourceUrl: null,
      instructions: null,
    });
    expect(recipe.ingredients).toMatchObject([{ name: "Salt", quantity: null, unit: null }]);
  });

  it("creates a recipe with only a name", async () => {
    await submitCreate(formData({ name: "Toast" }));

    const recipe = await onlyRecipe();
    expect(recipe).toMatchObject({ name: "Toast", servings: 2, prepMinutes: null, description: null });
    expect(recipe.ingredients).toEqual([]);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["zero", "0"],
    ["negative", "-4"],
    ["not a number", "a few"],
  ])("defaults servings to 2 when the value is %s", async (_label, servings) => {
    const overrides: Fields = servings === undefined ? {} : { servings };
    const form = recipeForm(overrides);
    if (servings === undefined) form.delete("servings");

    await submitCreate(form);

    expect((await onlyRecipe()).servings).toBe(2);
  });

  it.each([["zero", "0"], ["negative", "-10"], ["not a number", "quick"]])(
    "stores no prep time when it is %s",
    async (_label, prepMinutes) => {
      await submitCreate(recipeForm({ prepMinutes }));

      expect((await onlyRecipe()).prepMinutes).toBeNull();
    },
  );

  it("skips blank ingredient rows and keeps the order of the rest", async () => {
    await submitCreate(
      recipeForm({
        ingredientName: ["", "Rice", "   ", "Peas", ""],
        ingredientQuantity: ["5", "200", "3", "100", ""],
        ingredientUnit: ["g", "g", "g", "g", ""],
      }),
    );

    const { ingredients } = await onlyRecipe();
    expect(ingredients.map((i) => [i.name, i.quantity])).toEqual([
      ["Rice", 200],
      ["Peas", 100],
    ]);
  });

  it.each([
    ["a decimal comma", "1,5", 1.5],
    ["a decimal point", "0.25", 0.25],
    ["surrounding whitespace", "  3 ", 3],
    ["empty", "", null],
    ["whitespace-only", "   ", null],
    ["zero", "0", null],
    ["negative", "-2", null],
    ["not a number", "a pinch", null],
    ["infinite", "Infinity", null],
  ])("parses a quantity given as %s", async (_label, quantity, expected) => {
    await submitCreate(
      recipeForm({ ingredientName: ["Flour"], ingredientQuantity: [quantity], ingredientUnit: ["g"] }),
    );

    expect((await onlyRecipe()).ingredients[0].quantity).toBe(expected);
  });

  it("treats a row with no quantity or unit field at all as to taste", async () => {
    await submitCreate(formData({ name: "Salad", ingredientName: ["Lettuce", "Salt"] }));

    const { ingredients } = await onlyRecipe();
    expect(ingredients.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ["Lettuce", null, null],
      ["Salt", null, null],
    ]);
  });

  it("ignores extra form fields such as an id or timestamps", async () => {
    await submitCreate(recipeForm({ id: "chosen-by-attacker", createdAt: "1999-01-01", recipeId: "x" }));

    const recipe = await onlyRecipe();
    expect(recipe.id).not.toBe("chosen-by-attacker");
    expect(recipe.createdAt.getFullYear()).not.toBe(1999);
  });

  it.each([["missing", undefined], ["empty", ""], ["whitespace-only", "   \t "]])(
    "rejects a %s name, echoing the typed values and bumping attempt",
    async (_label, name) => {
      const form = recipeForm(name === undefined ? {} : { name });
      if (name === undefined) form.delete("name");
      const prev: RecipeFormState = { error: null, values: null, attempt: 3 };

      const state = await createRecipe(prev, form);

      expect(state).toEqual({
        error: "Give the recipe a name.",
        attempt: 4,
        values: {
          name: name ?? "",
          description: "Quick and warming",
          servings: "4",
          prepMinutes: "25",
          sourceUrl: "https://example.com/soup",
          instructions: "Chop\nSimmer",
          ingredients: [
            { name: "Tomatoes", quantity: "800", unit: "g" },
            { name: "Onion", quantity: "1", unit: "" },
          ],
        },
      });
      expect(await prisma.recipe.count()).toBe(0);
      expect(await prisma.ingredient.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["servings", { servings: "100" }, "A recipe can serve at most 99 people."],
    ["servings", { servings: "99999999999" }, "A recipe can serve at most 99 people."],
    ["prep minutes", { prepMinutes: "1441" }, "Prep time can be at most 1440 minutes."],
    ["prep minutes", { prepMinutes: "3000000000" }, "Prep time can be at most 1440 minutes."],
  ])("rejects out-of-range %s (%j) with the values echoed back", async (_label, overrides, error) => {
    const form = recipeForm(overrides);

    const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, form);

    expect(state).toMatchObject({ error, attempt: 1, values: expect.objectContaining(overrides) });
    expect(await prisma.recipe.count()).toBe(0);
  });

  it("accepts the largest allowed servings and prep time", async () => {
    await submitCreate(recipeForm({ servings: "99", prepMinutes: "1440" }));

    expect(await onlyRecipe()).toMatchObject({ servings: 99, prepMinutes: 1440 });
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/soup", "example.com/soup"])(
    "rejects a source that is not an http(s) address: %s",
    async (sourceUrl) => {
      const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ sourceUrl }));

      expect(state).toMatchObject({
        error: "The source has to be a web address starting with http:// or https://.",
        attempt: 1,
      });
      expect(await prisma.recipe.count()).toBe(0);
    },
  );

  it("drops NUL characters from text fields instead of crashing", async () => {
    await submitCreate(recipeForm({ name: "Soup\u0000", ingredientName: ["Salt\u0000", "Onion"] }));

    const recipe = await onlyRecipe();
    expect(recipe.name).toBe("Soup");
    expect(recipe.ingredients.map((row) => row.name)).toEqual(["Salt", "Onion"]);
  });

  it("echoes values verbatim, including blank rows and unparsed quantities", async () => {
    const state = await createRecipe(
      EMPTY_RECIPE_FORM_STATE,
      formData({
        name: "",
        servings: " 0 ",
        ingredientName: ["", "Salt"],
        ingredientQuantity: ["1,5", "lots"],
        ingredientUnit: ["kg", ""],
      }),
    );

    expect(state.attempt).toBe(1);
    expect(state.values).toMatchObject({
      servings: " 0 ",
      description: "",
      ingredients: [
        { name: "", quantity: "1,5", unit: "kg" },
        { name: "Salt", quantity: "lots", unit: "" },
      ],
    });
  });
});

describe("updateRecipe", () => {
  it("validates like createRecipe: an out-of-range value leaves the recipe unchanged", async () => {
    await submitCreate(recipeForm());
    const recipe = await onlyRecipe();

    const state = await updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id, servings: "500" }));

    expect(state).toMatchObject({ error: "A recipe can serve at most 99 people.", attempt: 1 });
    expect((await onlyRecipe()).servings).toBe(4);
  });

  it("updates the fields, replaces the ingredients in form order and redirects to the recipe", async () => {
    const recipe = await seedRecipe();

    await expectRedirect(
      updateRecipe(
        EMPTY_RECIPE_FORM_STATE,
        recipeForm({
          id: recipe.id,
          name: "New name",
          ingredientName: ["Zucchini", "", "Apple"],
          ingredientQuantity: ["2,5", "1", "abc"],
          ingredientUnit: ["kg", "g", " "],
        }),
      ),
      `/recipes/${recipe.id}`,
    );

    const updated = await onlyRecipe();
    expect(updated).toMatchObject({ id: recipe.id, name: "New name", servings: 4, prepMinutes: 25 });
    expect(updated.ingredients.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ["Zucchini", 2.5, "kg"],
      ["Apple", null, null],
    ]);
    // Old rows are gone, not merely re-ordered.
    expect(await prisma.ingredient.count()).toBe(2);
    expectRecipeViewsRevalidated();
  });

  it("removes every ingredient when the form sends none", async () => {
    const recipe = await seedRecipe();

    await expectRedirect(
      updateRecipe(EMPTY_RECIPE_FORM_STATE, formData({ id: recipe.id, name: "Bare" })),
      `/recipes/${recipe.id}`,
    );

    expect(await prisma.ingredient.count()).toBe(0);
    expect((await onlyRecipe()).servings).toBe(2);
  });

  it("does not touch another recipe's ingredients", async () => {
    const recipe = await seedRecipe("Edited");
    const other = await seedRecipe("Other");

    await expectRedirect(
      updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id })),
      `/recipes/${recipe.id}`,
    );

    expect(await prisma.ingredient.count({ where: { recipeId: other.id } })).toBe(2);
  });

  it("accepts an id padded with whitespace", async () => {
    const recipe = await seedRecipe();

    await expectRedirect(
      updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: `  ${recipe.id} ` })),
      `/recipes/${recipe.id}`,
    );

    expect((await onlyRecipe()).name).toBe("Tomato soup");
  });

  it.each([["missing", undefined], ["empty", ""], ["whitespace-only", "   "]])(
    "rejects a %s id with an echo of the values",
    async (_label, id) => {
      const recipe = await seedRecipe();

      const state = await updateRecipe(
        { error: "earlier", values: null, attempt: 1 },
        recipeForm(id === undefined ? {} : { id }),
      );

      expect(state.error).toBe("Missing recipe id.");
      expect(state.attempt).toBe(2);
      expect(state.values?.name).toBe("Tomato soup");
      expect((await prisma.recipe.findUnique({ where: { id: recipe.id } }))?.name).toBe("Old name");
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("rejects a whitespace-only name and leaves the recipe and its ingredients unchanged", async () => {
    const recipe = await seedRecipe();

    const state = await updateRecipe(
      EMPTY_RECIPE_FORM_STATE,
      recipeForm({ id: recipe.id, name: "  ", ingredientName: ["New"] }),
    );

    expect(state).toMatchObject({ error: "Give the recipe a name.", attempt: 1 });
    expect(state.values?.ingredients).toEqual([{ name: "New", quantity: "800", unit: "g" }]);
    const stored = await onlyRecipe();
    expect(stored.name).toBe("Old name");
    expect(stored.ingredients.map((i) => i.name)).toEqual(["Old A", "Old B"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails for an unknown id without creating a recipe or revalidating", async () => {
    await seedRecipe();

    await expect(
      updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: "no-such-recipe" })),
    ).rejects.not.toHaveProperty("url");

    expect(await prisma.recipe.count()).toBe(1);
    expect(await prisma.ingredient.count()).toBe(2);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps planned meals pointing at the edited recipe", async () => {
    const recipe = await seedRecipe();
    await prisma.plannedMeal.create({ data: { date: MONDAY, recipeId: recipe.id } });

    await expectRedirect(
      updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id })),
      `/recipes/${recipe.id}`,
    );

    expect((await prisma.plannedMeal.findUnique({ where: { date: MONDAY } }))?.recipeId).toBe(recipe.id);
  });
});

describe("deleteRecipe", () => {
  it("deletes the recipe with its ingredients, revalidates and redirects to the list", async () => {
    const recipe = await seedRecipe();

    await expectRedirect(deleteRecipe(formData({ id: recipe.id })), "/recipes");

    expect(await prisma.recipe.count()).toBe(0);
    expect(await prisma.ingredient.count()).toBe(0);
    expectRecipeViewsRevalidated();
  });

  it("removes days that only pointed at the recipe but keeps days with a custom title", async () => {
    const recipe = await seedRecipe();
    const other = await seedRecipe("Other");
    const tuesday = addDays(MONDAY, 1);
    const wednesday = addDays(MONDAY, 2);
    await prisma.plannedMeal.createMany({
      data: [
        { date: MONDAY, recipeId: recipe.id },
        { date: tuesday, recipeId: recipe.id, customTitle: "Soup, but with a twist" },
        { date: wednesday, recipeId: other.id },
        { date: addDays(MONDAY, 3), customTitle: "Leftovers" },
      ],
    });

    await expectRedirect(deleteRecipe(formData({ id: recipe.id })), "/recipes");

    const days = await prisma.plannedMeal.findMany({ orderBy: { date: "asc" } });
    expect(days.map((d) => [d.date.toISOString().slice(0, 10), d.recipeId, d.customTitle])).toEqual([
      ["2026-09-29", null, "Soup, but with a twist"],
      ["2026-09-30", other.id, null],
      ["2026-10-01", null, "Leftovers"],
    ]);
  });

  it("accepts an id padded with whitespace", async () => {
    const recipe = await seedRecipe();

    await expectRedirect(deleteRecipe(formData({ id: ` ${recipe.id}\n` })), "/recipes");

    expect(await prisma.recipe.count()).toBe(0);
  });

  it("rolls back and keeps planned days when the id is unknown", async () => {
    const recipe = await seedRecipe();
    await prisma.plannedMeal.create({ data: { date: MONDAY, recipeId: recipe.id } });

    await expect(deleteRecipe(formData({ id: "no-such-recipe" }))).rejects.not.toHaveProperty("url");

    expect(await prisma.recipe.count()).toBe(1);
    expect(await prisma.plannedMeal.count()).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([["missing", undefined], ["empty", ""], ["whitespace-only", "  "]])(
    "throws for a %s id without deleting anything",
    async (_label, id) => {
      await seedRecipe();
      await prisma.plannedMeal.create({ data: { date: MONDAY, recipeId: null, customTitle: "x" } });

      await expect(deleteRecipe(formData(id === undefined ? {} : { id }))).rejects.toThrow(
        "deleteRecipe: missing `id`",
      );

      expect(await prisma.recipe.count()).toBe(1);
      expect(await prisma.plannedMeal.count()).toBe(1);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
