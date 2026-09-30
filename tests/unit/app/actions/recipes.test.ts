import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { EMPTY_RECIPE_FORM_STATE, type RecipeFormState } from "@/lib/recipe-form";
import { addDays, parseDayKey } from "@/lib/week";
import { formData } from "@/tests/support/db";
import { asFile, testImage } from "@/tests/support/images";
import { testI18n } from "@/tests/support/i18n";
import { expectRedirect, RedirectError } from "@/tests/support/next";
import { createRecipe, deleteRecipe, updateRecipe } from "@/app/actions/recipes";

const MONDAY = parseDayKey("2026-09-28")!;

type Fields = Record<string, string | string[]>;

/** The state as the form shows it: the error message translated (English unless given). */
function shown(state: RecipeFormState, i18n = testI18n()) {
  return { ...state, error: state.error && i18n._(state.error) };
}

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

  it("stores each ingredient's category, Other when it is missing or unknown", async () => {
    await submitCreate(
      recipeForm({
        ingredientName: ["Tomatoes", "Onion", "Salt", "Milk"],
        ingredientQuantity: ["", "", "", ""],
        ingredientUnit: ["", "", "", ""],
        ingredientCategory: ["PRODUCE", "", "SPICES", "DAIRY_EGGS"],
      }),
    );

    const recipe = await onlyRecipe();
    expect(recipe.ingredients.map((i) => [i.name, i.category])).toEqual([
      ["Tomatoes", "PRODUCE"],
      ["Onion", "OTHER"],
      ["Salt", "OTHER"],
      ["Milk", "DAIRY_EGGS"],
    ]);
  });

  it("keeps a category with its row when blank rows are skipped", async () => {
    await submitCreate(
      recipeForm({
        ingredientName: ["", "Bread"],
        ingredientQuantity: ["", ""],
        ingredientUnit: ["", ""],
        ingredientCategory: ["FROZEN", "BAKERY"],
      }),
    );
    expect((await onlyRecipe()).ingredients.map((i) => [i.name, i.category])).toEqual([["Bread", "BAKERY"]]);
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

      expect(shown(state)).toEqual({
        error: "Give the recipe a name.",
        attempt: 4,
        values: {
          name: name ?? "",
          description: "Quick and warming",
          servings: "4",
          prepMinutes: "25",
          sourceUrl: "https://example.com/soup",
          instructions: "Chop\nSimmer",
          photoAlt: "",
          tags: [],
          ingredients: [
            { name: "Tomatoes", quantity: "800", unit: "g", category: "OTHER" },
            { name: "Onion", quantity: "1", unit: "", category: "OTHER" },
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

    expect(shown(state)).toMatchObject({ error, attempt: 1, values: expect.objectContaining(overrides) });
    expect(await prisma.recipe.count()).toBe(0);
  });

  it.each([
    [{ name: "" }, "Gib dem Rezept einen Namen."],
    [{ servings: "100" }, "Ein Rezept reicht für höchstens 99 Personen."],
    [{ prepMinutes: "1441" }, "Die Zubereitungszeit darf höchstens 1440 Minuten betragen."],
    [{ sourceUrl: "ftp://example.com" }, "Die Quelle muss eine Webadresse sein, die mit http:// oder https:// beginnt."],
  ])("returns the error as a message the form can show in German (%j)", async (overrides, german) => {
    const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm(overrides));

    // A message to translate, not a finished sentence: the language may change while it is shown.
    expect(state.error).toMatchObject({ id: expect.any(String) });
    expect(shown(state, testI18n("de")).error).toBe(german);
  });

  it("accepts the largest allowed servings and prep time", async () => {
    await submitCreate(recipeForm({ servings: "99", prepMinutes: "1440" }));

    expect(await onlyRecipe()).toMatchObject({ servings: 99, prepMinutes: 1440 });
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/soup", "example.com/soup"])(
    "rejects a source that is not an http(s) address: %s",
    async (sourceUrl) => {
      const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ sourceUrl }));

      expect(shown(state)).toMatchObject({
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
        ingredientCategory: ["PRODUCE", "PANTRY"],
      }),
    );

    expect(state.attempt).toBe(1);
    expect(state.values).toMatchObject({
      servings: " 0 ",
      description: "",
      ingredients: [
        { name: "", quantity: "1,5", unit: "kg", category: "PRODUCE" },
        { name: "Salt", quantity: "lots", unit: "", category: "PANTRY" },
      ],
    });
  });
});

describe("tags", () => {
  const tagsOf = async () => (await prisma.recipe.findMany({ include: { tags: true } })).map((r) => r.tags.map((t) => t.name).sort());
  const allTags = async () => (await prisma.tag.findMany({ orderBy: { name: "asc" } })).map((t) => t.name);

  it("creates a recipe with its tags, normalised and without duplicates", async () => {
    await submitCreate(recipeForm({ tag: ["Quick", "quick ", "One  Pan"] }));
    expect(await tagsOf()).toEqual([["one pan", "quick"]]);
  });

  it("reads the tags typed into the text field, as a browser without JavaScript posts them", async () => {
    await submitCreate(recipeForm({ tags: "Vegan, Quick,, " }));
    expect(await tagsOf()).toEqual([["quick", "vegan"]]);
  });

  it("merges the chips and the typed text", async () => {
    await submitCreate(recipeForm({ tag: ["vegan"], tags: "quick, vegan" }));
    expect(await tagsOf()).toEqual([["quick", "vegan"]]);
  });

  it("creates a recipe without tags when none are posted", async () => {
    await submitCreate(recipeForm());
    expect(await tagsOf()).toEqual([[]]);
    expect(await allTags()).toEqual([]);
  });

  it("shares a tag between recipes instead of creating it twice", async () => {
    await submitCreate(recipeForm({ name: "One", tag: ["quick"] }));
    await submitCreate(recipeForm({ name: "Two", tag: ["QUICK"] }));
    expect(await allTags()).toEqual(["quick"]);
    expect((await prisma.tag.findFirstOrThrow({ include: { recipes: true } })).recipes).toHaveLength(2);
  });

  it("replaces a recipe's tags on update and keeps a tag another recipe still uses", async () => {
    await submitCreate(recipeForm({ name: "One", tag: ["quick", "vegan"] }));
    const other = await prisma.recipe.create({ data: { name: "Two", tags: { connect: { name: "quick" } } } });
    const one = await prisma.recipe.findFirstOrThrow({ where: { name: "One" } });

    await expectRedirect(
      updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: one.id, name: "One", tag: ["spicy"] })),
      `/recipes/${one.id}`,
    );

    const updated = await prisma.recipe.findUniqueOrThrow({ where: { id: one.id }, include: { tags: true } });
    expect(updated.tags.map((t) => t.name)).toEqual(["spicy"]);
    const untouched = await prisma.recipe.findUniqueOrThrow({ where: { id: other.id }, include: { tags: true } });
    expect(untouched.tags.map((t) => t.name)).toEqual(["quick"]);
    // "vegan" was only on the edited recipe and is gone; "quick" stays for the other one.
    expect(await allTags()).toEqual(["quick", "spicy"]);
  });

  it("removes every tag when the form posts none, and the tags nobody uses", async () => {
    await submitCreate(recipeForm({ tag: ["quick"] }));
    const recipe = await prisma.recipe.findFirstOrThrow();
    await expectRedirect(updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id })), `/recipes/${recipe.id}`);
    expect(await tagsOf()).toEqual([[]]);
    expect(await allTags()).toEqual([]);
  });

  it("deletes the tags only the deleted recipe used", async () => {
    await submitCreate(recipeForm({ name: "One", tag: ["quick", "vegan"] }));
    await prisma.recipe.create({ data: { name: "Two", tags: { connect: { name: "quick" } } } });
    const one = await prisma.recipe.findFirstOrThrow({ where: { name: "One" } });

    await expectRedirect(deleteRecipe(formData({ id: one.id })), "/recipes");
    expect(await allTags()).toEqual(["quick"]);
  });

  it("saves a new recipe again when another save created the same tag a moment earlier", async () => {
    const create = vi.spyOn(prisma.recipe, "create");
    create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await submitCreate(recipeForm({ tag: ["quick"] }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(await tagsOf()).toEqual([["quick"]]);
    create.mockRestore();
  });

  it("does not hide other database errors behind the retry", async () => {
    const create = vi.spyOn(prisma.recipe, "create");
    create.mockRejectedValue(new Error("connection lost"));
    await expect(createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ tag: ["quick"] }))).rejects.toThrow("connection lost");
    expect(create).toHaveBeenCalledTimes(1);
    create.mockRestore();
  });

  it("refuses more than ten tags, echoing what was typed and changing nothing", async () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ tag: tags }));
    expect(state.attempt).toBe(1);
    expect(state.error).toMatchObject({ message: expect.stringContaining("tags") });
    expect(state.values?.tags).toEqual(tags);
    expect(await prisma.recipe.count()).toBe(0);
    expect(await allTags()).toEqual([]);
  });

  it("accepts ten tags and refuses a tag over thirty characters", async () => {
    await submitCreate(recipeForm({ tag: Array.from({ length: 10 }, (_, i) => `tag${i}`) }));
    expect((await tagsOf())[0]).toHaveLength(10);

    const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ name: "Long", tag: ["x".repeat(31)] }));
    expect(state.error).not.toBeNull();
    expect(await prisma.recipe.count()).toBe(1);
  });

  it("echoes the normalised tags when the form is refused for another reason", async () => {
    const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ name: " ", tag: ["Quick"], tags: "Vegan" }));
    expect(state.values?.tags).toEqual(["quick", "vegan"]);
  });
});

describe("updateRecipe", () => {
  it("validates like createRecipe: an out-of-range value leaves the recipe unchanged", async () => {
    await submitCreate(recipeForm());
    const recipe = await onlyRecipe();

    const state = await updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id, servings: "500" }));

    expect(shown(state)).toMatchObject({ error: "A recipe can serve at most 99 people.", attempt: 1 });
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

  it("replaces the categories together with the ingredients", async () => {
    const recipe = await seedRecipe();

    await expectRedirect(
      updateRecipe(
        EMPTY_RECIPE_FORM_STATE,
        recipeForm({
          id: recipe.id,
          ingredientName: ["Tomatoes"],
          ingredientQuantity: ["1"],
          ingredientUnit: ["kg"],
          ingredientCategory: ["PRODUCE"],
        }),
      ),
      `/recipes/${recipe.id}`,
    );

    expect((await onlyRecipe()).ingredients.map((i) => [i.name, i.category])).toEqual([["Tomatoes", "PRODUCE"]]);
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
        { error: { id: "earlier" }, values: null, attempt: 1 },
        recipeForm(id === undefined ? {} : { id }),
      );

      expect(shown(state).error).toBe("Missing recipe id.");
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

    expect(shown(state)).toMatchObject({ error: "Give the recipe a name.", attempt: 1 });
    expect(state.values?.ingredients).toEqual([{ name: "New", quantity: "800", unit: "g", category: "OTHER" }]);
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

describe("recipe photos", () => {
  const ALT = "A bowl of tomato soup";

  /** A recipe form with a photo chosen, as the browser posts it. */
  async function formWithPhoto(overrides: Fields = {}, image?: File): Promise<FormData> {
    const form = recipeForm({ photoAlt: ALT, ...overrides });
    form.append("photo", image ?? asFile(await testImage("jpeg", 2400, 1600), "soup.jpg"));
    return form;
  }
  const photoRow = (recipeId: string) => prisma.recipePhoto.findUnique({ where: { recipeId } });
  const noFile = () => new File([], "", { type: "application/octet-stream" });
  const shownState = (state: RecipeFormState) => shown(state);

  describe("createRecipe", () => {
    it("stores a chosen photo with the recipe: both sizes, its dimensions and its description", async () => {
      await submitCreate(await formWithPhoto());

      const recipe = await onlyRecipe();
      const photo = await photoRow(recipe.id);
      expect(photo?.alt).toBe(ALT);
      expect([photo?.fullWidth, photo?.fullHeight]).toEqual([1200, 800]);
      expect(photo?.full.length).toBeGreaterThan(0);
      expect(photo?.thumb.length).toBeGreaterThan(0);
      expect(Buffer.from(photo!.full).subarray(8, 12).toString()).toBe("WEBP");
    });

    it("trims the description", async () => {
      await submitCreate(await formWithPhoto({ photoAlt: "  Soup in a bowl  " }));
      expect((await photoRow((await onlyRecipe()).id))?.alt).toBe("Soup in a bowl");
    });

    it("creates a recipe without a photo when the file field is left empty", async () => {
      const form = recipeForm({ photoAlt: "" });
      form.append("photo", noFile());
      await submitCreate(form);

      expect(await prisma.recipePhoto.count()).toBe(0);
    });

    it("ignores a description typed without a photo", async () => {
      await submitCreate(recipeForm({ photoAlt: "Nothing to describe" }));
      expect(await prisma.recipePhoto.count()).toBe(0);
    });

    it("rejects a photo without a description, creating nothing", async () => {
      const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, await formWithPhoto({ photoAlt: "  " }));

      expect(shownState(state).error).toBe("Describe the photo in a few words, for people who cannot see it.");
      expect(state.values?.name).toBe("Tomato soup");
      expect(await prisma.recipe.count()).toBe(0);
    });

    it("rejects a description that is too long", async () => {
      const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, await formWithPhoto({ photoAlt: "x".repeat(201) }));
      expect(shownState(state).error).toBe("The description of the photo can be at most 200 characters.");
      expect(await prisma.recipe.count()).toBe(0);
    });

    it("rejects a file that is no image, echoing the description", async () => {
      const bad = asFile(Buffer.from("not an image"), "notes.jpg");
      const state = await createRecipe(EMPTY_RECIPE_FORM_STATE, await formWithPhoto({}, bad));

      expect(shownState(state).error).toBe("The photo could not be read. Choose another image.");
      expect(state.values?.photoAlt).toBe(ALT);
      expect(await prisma.recipe.count()).toBe(0);
    });
  });

  describe("updateRecipe", () => {
    async function seedWithPhoto() {
      const recipe = await seedRecipe();
      await submitUpdate(await formWithPhoto({ id: recipe.id }));
      return recipe;
    }
    async function submitUpdate(form: FormData) {
      const outcome = await updateRecipe(EMPTY_RECIPE_FORM_STATE, form).catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(RedirectError);
    }

    it("adds a photo to a recipe that had none", async () => {
      const recipe = await seedRecipe();
      await submitUpdate(await formWithPhoto({ id: recipe.id }));
      expect((await photoRow(recipe.id))?.alt).toBe(ALT);
    });

    it("replaces the photo and its description", async () => {
      const recipe = await seedWithPhoto();
      const before = await photoRow(recipe.id);

      await submitUpdate(
        await formWithPhoto({ id: recipe.id, photoAlt: "New picture" }, asFile(await testImage("png", 900, 900), "n.png")),
      );

      const after = await photoRow(recipe.id);
      expect(after?.alt).toBe("New picture");
      expect([after?.fullWidth, after?.fullHeight]).toEqual([900, 900]);
      expect(Buffer.compare(Buffer.from(after!.full), Buffer.from(before!.full))).not.toBe(0);
      expect(await prisma.recipePhoto.count()).toBe(1);
    });

    it("keeps the photo, untouched, when the form is saved without changing it", async () => {
      const recipe = await seedWithPhoto();
      const before = await photoRow(recipe.id);

      const form = recipeForm({ id: recipe.id, name: "Renamed", photoAlt: ALT });
      form.append("photo", noFile());
      await submitUpdate(form);

      const after = await photoRow(recipe.id);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
      expect(Buffer.compare(Buffer.from(after!.full), Buffer.from(before!.full))).toBe(0);
      expect((await prisma.recipe.findUnique({ where: { id: recipe.id } }))?.name).toBe("Renamed");
    });

    it("changes only the description when only that is edited, keeping the image", async () => {
      const recipe = await seedWithPhoto();
      const before = await photoRow(recipe.id);

      await submitUpdate(recipeForm({ id: recipe.id, photoAlt: "A better description" }));

      const after = await photoRow(recipe.id);
      expect(after?.alt).toBe("A better description");
      expect(Buffer.compare(Buffer.from(after!.full), Buffer.from(before!.full))).toBe(0);
    });

    it("removes the photo when asked to", async () => {
      const recipe = await seedWithPhoto();
      await submitUpdate(recipeForm({ id: recipe.id, photoAlt: ALT, removePhoto: "1" }));

      expect(await photoRow(recipe.id)).toBeNull();
      expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).not.toBeNull();
    });

    it("lets a new file win over 'Remove photo'", async () => {
      const recipe = await seedWithPhoto();
      await submitUpdate(await formWithPhoto({ id: recipe.id, removePhoto: "1", photoAlt: "Replaced" }));
      expect((await photoRow(recipe.id))?.alt).toBe("Replaced");
    });

    it("removes nothing when 'Remove photo' is ticked for a recipe without one", async () => {
      const recipe = await seedRecipe();
      await submitUpdate(recipeForm({ id: recipe.id, removePhoto: "1" }));
      expect(await prisma.recipePhoto.count()).toBe(0);
    });

    it("rejects emptying the description of an existing photo", async () => {
      const recipe = await seedWithPhoto();
      const state = await updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id, photoAlt: "" }));

      expect(shownState(state).error).toBe("Describe the photo in a few words, for people who cannot see it.");
      expect((await photoRow(recipe.id))?.alt).toBe(ALT);
    });

    it("leaves the recipe and its photo as they were when the new file is rejected", async () => {
      const recipe = await seedWithPhoto();
      const before = await photoRow(recipe.id);

      const bad = asFile(Buffer.from("not an image"), "notes.jpg");
      const state = await updateRecipe(
        EMPTY_RECIPE_FORM_STATE,
        await formWithPhoto({ id: recipe.id, name: "Should not be saved" }, bad),
      );

      expect(shownState(state).error).toBe("The photo could not be read. Choose another image.");
      expect((await prisma.recipe.findUnique({ where: { id: recipe.id } }))?.name).not.toBe("Should not be saved");
      const after = await photoRow(recipe.id);
      expect(Buffer.compare(Buffer.from(after!.full), Buffer.from(before!.full))).toBe(0);
    });
  });

  describe("deleteRecipe", () => {
    it("takes the photo with the recipe", async () => {
      await submitCreate(await formWithPhoto());
      const recipe = await onlyRecipe();
      expect(await prisma.recipePhoto.count()).toBe(1);

      await deleteRecipe(formData({ id: recipe.id })).catch(() => {});

      expect(await prisma.recipePhoto.count()).toBe(0);
    });
  });
});
