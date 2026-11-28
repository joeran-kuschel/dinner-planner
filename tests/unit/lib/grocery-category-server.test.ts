import { afterEach, describe, expect, it, vi } from "vitest";
import { addGroceryExtra, toggleGroceryLine } from "@/app/actions/groceries";
import { createRecipe, updateRecipe } from "@/app/actions/recipes";
import { prisma } from "@/lib/db";
import { type CategoryRow, OTHER_CATEGORY_ID } from "@/lib/grocery-category";
import { isMissingCategory, loadCategories, withCategories } from "@/lib/grocery-category-server";
import { EMPTY_RECIPE_FORM_STATE } from "@/lib/recipe-form";
import { formData } from "@/tests/support/db";
import { RedirectError } from "@/tests/support/next";

afterEach(() => {
  vi.restoreAllMocks();
});

/** What Prisma throws when Postgres refuses a row because the section it names is gone. */
const missingCategory = () => Object.assign(new Error("Foreign key constraint violated on the constraint: `Ingredient_categoryId_fkey`"), { code: "P2003" });

describe("isMissingCategory", () => {
  it.each([
    [{ code: "P2003" }, true],
    [missingCategory(), true],
    [{ code: "P2002" }, false],
    [{ code: 2003 }, false],
    [new Error("P2003"), false],
    [null, false],
    [undefined, false],
    ["P2003", false],
  ])("%j -> %s", (error, expected) => {
    expect(isMissingCategory(error)).toBe(expected);
  });
});

describe("loadCategories", () => {
  it("lists every section in shop order, a tie in the positions by id", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_drinks" }, data: { position: 7 } });
    const rows = await loadCategories();
    expect(rows.map((row) => row.id).slice(7)).toEqual(["cat_drinks", "cat_frozen", "cat_other"]);
  });
});

describe("withCategories", () => {
  it("hands the write the sections as they are and returns what it returns", async () => {
    const write = vi.fn(async (categories: CategoryRow[]) => categories.length);
    await expect(withCategories(write)).resolves.toBe(10);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("tries a write the database refused once more, with the sections read again", async () => {
    await prisma.groceryCategory.create({ data: { id: "cat_soon_gone", name: "Soon gone", position: 9 } });
    const seen: string[][] = [];
    const write = vi.fn(async (categories: CategoryRow[]) => {
      seen.push(categories.map((category) => category.id));
      if (seen.length === 1) {
        await prisma.groceryCategory.delete({ where: { id: "cat_soon_gone" } }); // deleted in another tab while saving
        throw missingCategory();
      }
      return "saved";
    });

    await expect(withCategories(write)).resolves.toBe("saved");

    expect(write).toHaveBeenCalledTimes(2);
    expect(seen[0]).toContain("cat_soon_gone");
    expect(seen[1]).not.toContain("cat_soon_gone");
  });

  it("rethrows any other error at once, without a second try", async () => {
    const write = vi.fn(async () => {
      throw Object.assign(new Error("unique constraint"), { code: "P2002" });
    });
    await expect(withCategories(write)).rejects.toThrow("unique constraint");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("rethrows a plain error too", async () => {
    await expect(
      withCategories(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("throws the second refusal instead of trying a third time", async () => {
    const write = vi.fn(async () => {
      throw missingCategory();
    });
    await expect(withCategories(write)).rejects.toMatchObject({ code: "P2003" });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("throws a different error of the second try as it is", async () => {
    const write = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(missingCategory())
      .mockRejectedValueOnce(new Error("second failure"));
    await expect(withCategories(write)).rejects.toThrow("second failure");
  });

  it("does not read the sections again when the first write goes through", async () => {
    const findMany = vi.spyOn(prisma.groceryCategory, "findMany");
    await withCategories(async () => "ok");
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

// The race, as the four writers see it: the sections were read, one is deleted, and the form still names it. The first
// read here is made stale on purpose (it lists a section the database no longer has), so the write is really refused by
// Postgres, and the second read has no such section: the row ends up in "Other" instead of the save failing.
describe("a form that names a section deleted a moment ago", () => {
  const GONE = "cat_deleted_a_moment_ago";
  const WEEK = "2026-09-28";

  function staleOnce() {
    const real = prisma.groceryCategory.findMany.bind(prisma.groceryCategory);
    const stale = vi.spyOn(prisma.groceryCategory, "findMany");
    stale.mockImplementationOnce((async (...args: Parameters<typeof real>) => [
      ...(await real(...args)),
      { id: GONE, key: null, name: "Gone", position: 5 },
    ]) as never);
    return stale;
  }

  async function runCreate(form: FormData) {
    const outcome = await createRecipe(EMPTY_RECIPE_FORM_STATE, form).then(
      (state) => state,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(RedirectError);
  }

  const recipeForm = (extra: Record<string, string | string[]> = {}) =>
    formData({
      name: "Fish pie",
      servings: "2",
      ingredientName: ["Haddock"],
      ingredientQuantity: ["1"],
      ingredientUnit: ["kg"],
      ingredientCategory: [GONE],
      ...extra,
    });

  it("createRecipe files the ingredient under Other and reads the sections twice", async () => {
    const stale = staleOnce();
    await runCreate(recipeForm());
    expect(stale).toHaveBeenCalledTimes(2);
    expect((await prisma.ingredient.findFirstOrThrow()).categoryId).toBe(OTHER_CATEGORY_ID);
  });

  it("updateRecipe files the ingredient under Other and keeps the recipe's other changes", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "Old", ingredients: { create: [{ name: "Old", categoryId: "cat_produce" }] } } });
    const stale = staleOnce();

    const outcome = await updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id, name: "New" })).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(RedirectError);
    expect(stale).toHaveBeenCalledTimes(2);
    expect((await prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id } })).name).toBe("New");
    expect((await prisma.ingredient.findMany({ where: { recipeId: recipe.id } })).map((row) => [row.name, row.categoryId])).toEqual([["Haddock", OTHER_CATEGORY_ID]]);
  });

  it("a refused updateRecipe is rolled back as a whole before the retry, so the old ingredients are not duplicated", async () => {
    const recipe = await prisma.recipe.create({ data: { name: "Old", ingredients: { create: [{ name: "Old", categoryId: "cat_produce" }] } } });
    staleOnce();
    await updateRecipe(EMPTY_RECIPE_FORM_STATE, recipeForm({ id: recipe.id })).catch(() => undefined);
    expect(await prisma.ingredient.count({ where: { recipeId: recipe.id } })).toBe(1);
  });

  it("addGroceryExtra files the item under Other", async () => {
    const stale = staleOnce();
    await addGroceryExtra(formData({ weekStart: WEEK, label: "Dog food", category: GONE }));
    expect(stale).toHaveBeenCalledTimes(2);
    expect(await prisma.groceryEntry.findFirstOrThrow()).toMatchObject({ label: "Dog food", manual: true, categoryId: OTHER_CATEGORY_ID });
  });

  it("toggleGroceryLine on a carried entry writes its row under Other", async () => {
    const stale = staleOnce();
    await toggleGroceryLine(
      formData({ weekStart: WEEK, key: "dog food|", label: "Dog food", checked: "true", carried: "1", quantity: "2", unit: "bags", category: GONE }),
    );
    expect(stale).toHaveBeenCalledTimes(2);
    expect(await prisma.groceryEntry.findFirstOrThrow()).toMatchObject({ key: "dog food|", checked: true, manual: true, quantity: 2, unit: "bags", categoryId: OTHER_CATEGORY_ID });
  });

  it("a section that still exists is kept on the first try, with one read of the sections", async () => {
    const spy = vi.spyOn(prisma.groceryCategory, "findMany");
    await addGroceryExtra(formData({ weekStart: WEEK, label: "Ice", category: "cat_frozen" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await prisma.groceryEntry.findFirstOrThrow()).categoryId).toBe("cat_frozen");
  });

  it("a section that was never there is Other without any retry", async () => {
    const spy = vi.spyOn(prisma.groceryCategory, "findMany");
    await addGroceryExtra(formData({ weekStart: WEEK, label: "Ice", category: "cat_never_existed" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await prisma.groceryEntry.findFirstOrThrow()).categoryId).toBe(OTHER_CATEGORY_ID);
  });
});
