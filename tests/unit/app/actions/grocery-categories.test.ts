import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { categoryName, MAX_CATEGORIES, MAX_CATEGORY_NAME, SEEDED_CATEGORIES } from "@/lib/grocery-category";
import { formData } from "@/tests/support/db";
import { testI18n } from "@/tests/support/i18n";
import { expectRedirect, RedirectError } from "@/tests/support/next";

// The page's language, as the request's cookie says it (`getServerI18n` reads it).
const request = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "locale" ? { value: request.locale } : undefined) }),
  headers: async () => new Headers(),
}));

const { addGroceryCategory, deleteGroceryCategory, moveGroceryCategory, renameGroceryCategory } = await import(
  "@/app/actions/grocery-categories"
);

const PAGE = "/groceries/categories";
const WEEK = new Date("2026-09-28T00:00:00Z");

/** Every section in shop order, as the database has them. */
const sections = () => prisma.groceryCategory.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
/** The names in shop order, as an English page shows them. */
async function shownNames() {
  const en = testI18n("en");
  return (await sections()).map((row) => categoryName(row, en));
}
const positions = async () => (await sections()).map((row) => row.position);

/** Run an action that ends in a redirect and return where to, as a URL. */
async function redirectUrl(action: Promise<unknown>): Promise<URL> {
  const outcome = await action.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(RedirectError);
  return new URL((outcome as RedirectError).url, "http://localhost");
}

/** The refusal an action redirects to: the page with `?error=`, a changing `n`, and what was typed. */
async function refusal(action: Promise<unknown>) {
  const url = await redirectUrl(action);
  expect(url.pathname).toBe(PAGE);
  const query = Object.fromEntries(url.searchParams);
  expect(query.n).toMatch(/^\d+$/);
  delete query.n;
  return query;
}

/** A change that went through shows the page again in place (no redirect: that would render it from scratch). */
const expectSuccess = (action: Promise<unknown>) => expect(action).resolves.toBeUndefined();

const expectRevalidated = () =>
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/groceries"], [PAGE], ["/recipes", "layout"]]);
const expectNotRevalidated = () => expect(revalidatePath).not.toHaveBeenCalled();

/** Add `count` sections directly, after the ten seeded ones, in front of nothing in particular. */
async function addMany(count: number) {
  await prisma.groceryCategory.createMany({
    data: Array.from({ length: count }, (_, index) => ({ id: `extra_${String(index).padStart(2, "0")}`, name: `Extra ${index}`, position: 10 + index })),
  });
}

beforeEach(() => {
  request.locale = "en";
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(redirect).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("addGroceryCategory", () => {
  it("adds the section just before Other and numbers every section again", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));

    expect(await shownNames()).toEqual([
      "Fruit and vegetables",
      "Bakery",
      "Meat and fish",
      "Dairy and eggs",
      "Pasta, rice, etc.",
      "Pantry",
      "Herbs & spices",
      "Frozen",
      "Drinks",
      "Pet food",
      "Other",
    ]);
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expectRevalidated();
  });

  it("stores a user's section with a name and no key", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));
    expect(await prisma.groceryCategory.findFirst({ where: { name: "Pet food" } })).toMatchObject({ key: null, name: "Pet food" });
  });

  it("puts a second one after the first, still before Other", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));
    await expectSuccess(addGroceryCategory(formData({ name: "Baby" })));
    expect((await shownNames()).slice(-3)).toEqual(["Pet food", "Baby", "Other"]);
    expect(await positions()).toEqual(Array.from({ length: 12 }, (_, index) => index));
  });

  it("trims the name and makes every run of white space one space", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "  Pet \t  food\n " })));
    expect((await shownNames()).at(-2)).toBe("Pet food");
  });

  it("accepts a name of exactly the longest length", async () => {
    const name = "x".repeat(MAX_CATEGORY_NAME);
    await expectSuccess(addGroceryCategory(formData({ name })));
    expect((await shownNames()).at(-2)).toBe(name);
  });

  it("refuses a name one character too long, and gives back the part the field can hold plus one", async () => {
    const name = "y".repeat(MAX_CATEGORY_NAME + 25);
    expect(await refusal(addGroceryCategory(formData({ name })))).toEqual({ error: "long", name: "y".repeat(MAX_CATEGORY_NAME + 1) });
    expect(await sections()).toHaveLength(10);
    expectNotRevalidated();
  });

  it.each([["an empty name", { name: "" }], ["only white space", { name: " \t\n " }], ["no name field", {}]])(
    "refuses %s as empty, without a name to put back",
    async (_label, fields) => {
      expect(await refusal(addGroceryCategory(formData(fields)))).toEqual({ error: "empty" });
      expect(await sections()).toHaveLength(10);
      expectNotRevalidated();
    },
  );

  it("counts the length after the white space is collapsed", async () => {
    const name = `${"a".repeat(MAX_CATEGORY_NAME - 1)}      `;
    await expectSuccess(addGroceryCategory(formData({ name })));
    expect((await shownNames()).at(-2)).toBe("a".repeat(MAX_CATEGORY_NAME - 1));
  });

  it.each([
    ["the same name", "Pet food"],
    ["another case", "PET FOOD"],
    ["spaces around it", "  pet   food "],
  ])("refuses a name that is taken: %s", async (_label, typed) => {
    await prisma.groceryCategory.create({ data: { name: "Pet food", position: 9 } });
    const before = await sections();

    expect(await refusal(addGroceryCategory(formData({ name: typed })))).toEqual({ error: "duplicate", name: typed.trim().replace(/\s+/g, " ") });

    expect(await sections()).toEqual(before);
    expectNotRevalidated();
  });

  it("refuses the translated name of a starting section that has not been renamed, in any case", async () => {
    expect(await refusal(addGroceryCategory(formData({ name: "bakery" })))).toEqual({ error: "duplicate", name: "bakery" });
  });

  it("refuses the German name of a starting section on an English page, and the English one on a German page", async () => {
    expect(await refusal(addGroceryCategory(formData({ name: "Backwaren" })))).toMatchObject({ error: "duplicate" });

    request.locale = "de";
    expect(await refusal(addGroceryCategory(formData({ name: "Bakery" })))).toMatchObject({ error: "duplicate" });
    expect(await refusal(addGroceryCategory(formData({ name: "bakery" })))).toMatchObject({ error: "duplicate" });
    expect(await refusal(addGroceryCategory(formData({ name: "Backwaren" })))).toMatchObject({ error: "duplicate" });
    expect(await sections()).toHaveLength(10);
  });

  it("frees a starting section's translated names once it has been renamed", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_bakery" }, data: { name: "Bread" } });

    await expectSuccess(addGroceryCategory(formData({ name: "Bakery" })));
    expect(await shownNames()).toContain("Bread");
    expect((await shownNames()).at(-2)).toBe("Bakery");
    await expect(refusal(addGroceryCategory(formData({ name: "bread" })))).resolves.toMatchObject({ error: "duplicate" });
  });

  it("allows as many sections as the limit and refuses the next one", async () => {
    await addMany(MAX_CATEGORIES - 10 - 1);
    await expectSuccess(addGroceryCategory(formData({ name: "The thirtieth" })));
    expect(await sections()).toHaveLength(MAX_CATEGORIES);
    vi.mocked(revalidatePath).mockClear();

    expect(await refusal(addGroceryCategory(formData({ name: "One too many" })))).toEqual({ error: "limit", name: "One too many" });
    expect(await sections()).toHaveLength(MAX_CATEGORIES);
    expectNotRevalidated();
  });

  it("checks the name before the limit, so an empty name at the limit is still 'empty'", async () => {
    await addMany(MAX_CATEGORIES - 10);
    expect(await refusal(addGroceryCategory(formData({ name: " " })))).toEqual({ error: "empty" });
  });

  it("adds the section last when Other is missing, and numbers the sections", async () => {
    await prisma.groceryCategory.delete({ where: { id: "cat_other" } });

    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));

    expect((await shownNames()).at(-1)).toBe("Pet food");
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("heals a tie in the positions while it numbers them", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_drinks" }, data: { position: 7 } }); // ties with Frozen
    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));
    expect(await positions()).toEqual(Array.from({ length: 11 }, (_, index) => index));
    expect((await shownNames()).at(-1)).toBe("Other");
  });

  it("ignores extra fields, and one that is a file", async () => {
    const form = formData({ name: "Pet food", position: "0", key: "OTHER", id: "cat_other" });
    form.append("name", new File(["x"], "x.txt"));
    await expectSuccess(addGroceryCategory(form));
    expect(await prisma.groceryCategory.findFirst({ where: { name: "Pet food" } })).toMatchObject({ key: null, position: 9 });
    expect(await prisma.groceryCategory.findUnique({ where: { id: "cat_other" } })).toMatchObject({ key: "OTHER", name: null });
  });

  it("removes a NUL character, which Postgres would refuse", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "Pet\u0000food" })));
    expect((await shownNames()).at(-2)).toBe("Petfood");
  });
});

describe("renameGroceryCategory", () => {
  const rename = (id: string, name: string) => renameGroceryCategory(formData({ id, name }));
  const row = (id: string) => prisma.groceryCategory.findUniqueOrThrow({ where: { id } });

  it("names a starting section, which keeps its key", async () => {
    await expectSuccess(rename("cat_pantry", "Cupboard"));
    expect(await row("cat_pantry")).toMatchObject({ key: "PANTRY", name: "Cupboard" });
    expectRevalidated();
  });

  it("renames a section the user added", async () => {
    const mine = await prisma.groceryCategory.create({ data: { name: "Pet food", position: 9 } });
    await expectSuccess(rename(mine.id, "Animals"));
    expect(await row(mine.id)).toMatchObject({ key: null, name: "Animals" });
  });

  it("trims the name and makes runs of white space one space", async () => {
    await expectSuccess(rename("cat_pantry", "  Dry \t goods "));
    expect((await row("cat_pantry")).name).toBe("Dry goods");
  });

  it("can rename Other, which stays Other", async () => {
    await expectSuccess(rename("cat_other", "Miscellaneous"));
    expect(await row("cat_other")).toMatchObject({ key: "OTHER", name: "Miscellaneous", position: 9 });
  });

  it.each([["empty", ""], ["only white space", " \t "]])(
    "sends a starting section saved %s back to its translated name",
    async (_label, typed) => {
      await prisma.groceryCategory.update({ where: { id: "cat_pantry" }, data: { name: "Cupboard" } });
      await expectSuccess(rename("cat_pantry", typed));
      expect((await row("cat_pantry")).name).toBeNull();
      expectRevalidated();
    },
  );

  it("sends Other saved empty back to its translated name too", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_other" }, data: { name: "Misc" } });
    await expectSuccess(rename("cat_other", ""));
    expect((await row("cat_other")).name).toBeNull();
  });

  it("refuses a section the user added saved empty, and leaves its name", async () => {
    const mine = await prisma.groceryCategory.create({ data: { name: "Pet food", position: 9 } });
    expect(await refusal(rename(mine.id, "  "))).toEqual({ error: "empty", id: mine.id });
    expect((await row(mine.id)).name).toBe("Pet food");
    expectNotRevalidated();
  });

  it("keeps a starting section translated when it is saved under the name it is shown by", async () => {
    await expectSuccess(rename("cat_bakery", "Bakery"));
    expect((await row("cat_bakery")).name).toBeNull();
  });

  it("keeps it translated when saved under the name the German page shows", async () => {
    request.locale = "de";
    await expectSuccess(rename("cat_bakery", "Backwaren"));
    expect((await row("cat_bakery")).name).toBeNull();
  });

  it("stores the other language's name for the section, since that is not the name it is shown by", async () => {
    await expectSuccess(rename("cat_bakery", "Backwaren"));
    expect((await row("cat_bakery")).name).toBe("Backwaren");
  });

  it("stores the shown name of a section that already has a name of its own", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_bakery" }, data: { name: "Bread" } });
    await expectSuccess(rename("cat_bakery", "Bread"));
    expect((await row("cat_bakery")).name).toBe("Bread");
  });

  it("lets a section be saved again under its own name in another case", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_bakery" }, data: { name: "Bread" } });
    await expectSuccess(rename("cat_bakery", "BREAD"));
    expect((await row("cat_bakery")).name).toBe("BREAD");
  });

  it.each([
    ["another section's name", "Pantry"],
    ["another section's name in another case", "pANTRY"],
    ["another language's name of another section", "Vorräte"],
  ])("refuses %s, and gives back the typed name and the section", async (_label, typed) => {
    // "Vorräte" must be the German default of Pantry for the last case to be a real duplicate.
    expect(categoryName({ key: "PANTRY", name: null }, testI18n("de"))).toBe("Vorräte");

    expect(await refusal(rename("cat_bakery", typed))).toEqual({ error: "duplicate", id: "cat_bakery", name: typed });
    expect((await row("cat_bakery")).name).toBeNull();
    expectNotRevalidated();
  });

  it("refuses a name that is too long, with the part that fits plus one, and leaves the section", async () => {
    const name = "z".repeat(MAX_CATEGORY_NAME + 10);
    expect(await refusal(rename("cat_bakery", name))).toEqual({ error: "long", id: "cat_bakery", name: "z".repeat(MAX_CATEGORY_NAME + 1) });
    expect((await row("cat_bakery")).name).toBeNull();
  });

  it("accepts a name of exactly the longest length", async () => {
    await expectSuccess(rename("cat_bakery", "q".repeat(MAX_CATEGORY_NAME)));
    expect((await row("cat_bakery")).name).toHaveLength(MAX_CATEGORY_NAME);
  });

  it("shows the page again, changing nothing, for a section deleted in another tab", async () => {
    const before = await sections();
    await expectSuccess(rename("cat_gone", "Anything"));
    expect(await sections()).toEqual(before);
    expectRevalidated();
  });

  it("throws for a form without an id", async () => {
    await expect(renameGroceryCategory(formData({ name: "Nameless" }))).rejects.toThrow("renameGroceryCategory: missing `id`");
    await expect(rename("   ", "Nameless")).rejects.toThrow("missing `id`");
  });

  it("changes neither the position nor the key, whatever else is posted", async () => {
    await expectSuccess(renameGroceryCategory(formData({ id: "cat_pantry", name: "Cupboard", position: "0", key: "OTHER" })));
    expect(await row("cat_pantry")).toMatchObject({ key: "PANTRY", position: 5 });
  });
});

describe("moveGroceryCategory", () => {
  const move = (id: string, direction: string) => moveGroceryCategory(formData({ id, direction }));

  it("swaps a section with the one above it", async () => {
    await expectSuccess(move("cat_pantry", "up"));
    expect((await shownNames()).slice(4, 7)).toEqual(["Pantry", "Pasta, rice, etc.", "Herbs & spices"]);
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expectRevalidated();
  });

  it("swaps a section with the one below it", async () => {
    await expectSuccess(move("cat_pantry", "down"));
    expect((await shownNames()).slice(4, 7)).toEqual(["Pasta, rice, etc.", "Herbs & spices", "Pantry"]);
  });

  it("moves only the two neighbours", async () => {
    const before = await shownNames();
    await expectSuccess(move("cat_bakery", "down"));
    const after = await shownNames();
    expect(after.filter((name, index) => name !== before[index])).toEqual(["Meat and fish", "Bakery"]);
  });

  it("does nothing, and still shows the page, for the first section moved up", async () => {
    const before = await sections();
    await expectSuccess(move("cat_produce", "up"));
    expect(await sections()).toEqual(before);
  });

  it("does not move the section before Other down, so nothing goes past Other", async () => {
    const before = await sections();
    await expectSuccess(move("cat_drinks", "down"));
    expect(await sections()).toEqual(before);
  });

  it.each(["up", "down"])("does not move Other %s", async (direction) => {
    const before = await sections();
    await expectSuccess(move("cat_other", direction));
    expect(await sections()).toEqual(before);
  });

  it("moves a section the user added like any other, never past Other", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));
    const mine = await prisma.groceryCategory.findFirstOrThrow({ where: { name: "Pet food" } });

    await expectSuccess(move(mine.id, "down"));
    expect((await shownNames()).slice(-2)).toEqual(["Pet food", "Other"]);

    await expectSuccess(move(mine.id, "up"));
    expect((await shownNames()).slice(-3)).toEqual(["Pet food", "Drinks", "Other"]);
  });

  it("does nothing for a section that does not exist (deleted in another tab)", async () => {
    const before = await sections();
    await expectSuccess(move("cat_gone", "up"));
    expect(await sections()).toEqual(before);
  });

  it("numbers every section from 0 again, so a tie in the positions cannot survive a move", async () => {
    // Frozen and Drinks share a position; the database lists them by id, so Drinks comes first.
    await prisma.groceryCategory.update({ where: { id: "cat_drinks" }, data: { position: 7 } });
    expect((await shownNames()).slice(7, 9)).toEqual(["Drinks", "Frozen"]);

    await expectSuccess(move("cat_produce", "down"));

    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect((await shownNames()).slice(0, 2)).toEqual(["Bakery", "Fruit and vegetables"]);
    expect((await shownNames()).slice(7, 9)).toEqual(["Drinks", "Frozen"]);
  });

  it("closes gaps in the positions too", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_other" }, data: { position: 50 } });
    await prisma.groceryCategory.update({ where: { id: "cat_frozen" }, data: { position: 20 } });
    await expectSuccess(move("cat_bakery", "up"));
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect((await shownNames()).at(-1)).toBe("Other");
  });

  it.each([["sideways"], ["UP"], [""]])("throws for the direction %j", async (direction) => {
    const before = await sections();
    await expect(move("cat_pantry", direction)).rejects.toThrow("moveGroceryCategory: missing `id` or `direction`");
    expect(await sections()).toEqual(before);
    expectNotRevalidated();
  });

  it("throws for a missing direction or id", async () => {
    await expect(moveGroceryCategory(formData({ id: "cat_pantry" }))).rejects.toThrow("moveGroceryCategory");
    await expect(moveGroceryCategory(formData({ direction: "up" }))).rejects.toThrow("moveGroceryCategory");
  });

  it("leaves what is filed under the sections alone", async () => {
    await prisma.recipe.create({ data: { name: "Bread", ingredients: { create: [{ name: "Flour", categoryId: "cat_bakery" }] } } });
    await expectSuccess(move("cat_bakery", "up"));
    expect((await prisma.ingredient.findFirstOrThrow()).categoryId).toBe("cat_bakery");
  });
});

describe("deleteGroceryCategory", () => {
  const remove = (id: string) => deleteGroceryCategory(formData({ id }));

  async function fileUnder(categoryId: string) {
    const recipe = await prisma.recipe.create({
      data: {
        name: `Dish for ${categoryId}`,
        ingredients: { create: [{ name: "One", categoryId }, { name: "Two", position: 1, categoryId }] },
      },
      include: { ingredients: true },
    });
    const entry = await prisma.groceryEntry.create({
      data: { weekStart: WEEK, key: `entry|${categoryId}`, label: "Entry", manual: true, categoryId },
    });
    return { recipe, entry };
  }

  it("moves its ingredients and its grocery entries to Other, deletes it and numbers the rest again", async () => {
    const { recipe, entry } = await fileUnder("cat_frozen");
    const { entry: untouched } = await fileUnder("cat_dairy_eggs");

    await expectSuccess(remove("cat_frozen"));

    expect(await prisma.groceryCategory.findUnique({ where: { id: "cat_frozen" } })).toBeNull();
    expect((await prisma.ingredient.findMany({ where: { recipeId: recipe.id } })).map((row) => row.categoryId)).toEqual(["cat_other", "cat_other"]);
    expect((await prisma.groceryEntry.findUniqueOrThrow({ where: { id: entry.id } })).categoryId).toBe("cat_other");
    expect((await prisma.groceryEntry.findUniqueOrThrow({ where: { id: untouched.id } })).categoryId).toBe("cat_dairy_eggs");
    expect(await shownNames()).toEqual([
      "Fruit and vegetables",
      "Bakery",
      "Meat and fish",
      "Dairy and eggs",
      "Pasta, rice, etc.",
      "Pantry",
      "Herbs & spices",
      "Drinks",
      "Other",
    ]);
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expectRevalidated();
  });

  it("keeps the ingredients' own order and the entries' tick state while moving them", async () => {
    const { entry } = await fileUnder("cat_frozen");
    await prisma.groceryEntry.update({ where: { id: entry.id }, data: { checked: true, quantity: 3, unit: "bags" } });

    await expectSuccess(remove("cat_frozen"));

    expect(await prisma.groceryEntry.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({
      checked: true,
      quantity: 3,
      unit: "bags",
      manual: true,
      categoryId: "cat_other",
    });
    expect((await prisma.ingredient.findMany({ orderBy: { position: "asc" } })).map((row) => row.name)).toEqual(["One", "Two"]);
  });

  it("deletes a section the user added the same way", async () => {
    await expectSuccess(addGroceryCategory(formData({ name: "Pet food" })));
    const mine = await prisma.groceryCategory.findFirstOrThrow({ where: { name: "Pet food" } });
    const { entry } = await fileUnder(mine.id);
    vi.mocked(revalidatePath).mockClear();

    await expectSuccess(remove(mine.id));

    expect(await prisma.groceryCategory.findUnique({ where: { id: mine.id } })).toBeNull();
    expect((await prisma.groceryEntry.findUniqueOrThrow({ where: { id: entry.id } })).categoryId).toBe("cat_other");
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("deletes an empty section", async () => {
    await expectSuccess(remove("cat_drinks"));
    expect((await shownNames()).at(-2)).toBe("Frozen");
  });

  it("heals a tie in the positions while it numbers the rest", async () => {
    await prisma.groceryCategory.update({ where: { id: "cat_drinks" }, data: { position: 7 } });
    await expectSuccess(remove("cat_produce"));
    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not delete Other, and nothing moves", async () => {
    const { recipe } = await fileUnder("cat_other");
    const before = await sections();

    await expectSuccess(remove("cat_other"));

    expect(await sections()).toEqual(before);
    expect(await prisma.ingredient.count({ where: { recipeId: recipe.id, categoryId: "cat_other" } })).toBe(2);
  });

  it("does not delete anything when Other is missing, since there would be nowhere for the items to go", async () => {
    await prisma.groceryCategory.delete({ where: { id: "cat_other" } });
    await expectSuccess(remove("cat_frozen"));
    expect(await prisma.groceryCategory.findUnique({ where: { id: "cat_frozen" } })).not.toBeNull();
  });

  it("is a no-op for a section that is gone already (a second click, another tab)", async () => {
    const before = await sections();
    await expectSuccess(remove("cat_gone"));
    expect(await sections()).toEqual(before);
    expectRevalidated();
  });

  it("is a no-op the second time it runs for the same section", async () => {
    await fileUnder("cat_frozen");
    await expectSuccess(remove("cat_frozen"));
    const after = await sections();
    await expectSuccess(remove("cat_frozen"));
    expect(await sections()).toEqual(after);
  });

  it("throws for a form without an id", async () => {
    await expect(deleteGroceryCategory(formData({}))).rejects.toThrow("deleteGroceryCategory: missing `id`");
    await expect(remove(" ")).rejects.toThrow("missing `id`");
    expectNotRevalidated();
  });

  it("ignores extra fields", async () => {
    await expectSuccess(deleteGroceryCategory(formData({ id: "cat_frozen", moveTo: "cat_produce" })));
    expect(await prisma.groceryCategory.findUnique({ where: { id: "cat_frozen" } })).toBeNull();
  });

  describe("when the database refuses the section being gone (a row filed under it at that moment)", () => {
    const refused = () => Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" });

    it("tries once more, and the second try goes through", async () => {
      const { recipe } = await fileUnder("cat_frozen");
      const transaction = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(refused());

      await expectSuccess(remove("cat_frozen"));

      expect(transaction).toHaveBeenCalledTimes(2);
      expect(await prisma.groceryCategory.findUnique({ where: { id: "cat_frozen" } })).toBeNull();
      expect((await prisma.ingredient.findMany({ where: { recipeId: recipe.id } })).map((row) => row.categoryId)).toEqual(["cat_other", "cat_other"]);
      expectRevalidated();
    });

    it("gives up after the second refusal and shows no success", async () => {
      const transaction = vi.spyOn(prisma, "$transaction").mockRejectedValue(refused());

      await expect(remove("cat_frozen")).rejects.toMatchObject({ code: "P2003" });

      expect(transaction).toHaveBeenCalledTimes(2);
      expect(await prisma.groceryCategory.findUnique({ where: { id: "cat_frozen" } })).not.toBeNull();
      expectNotRevalidated();
    });

    it("does not try again for any other error", async () => {
      const transaction = vi.spyOn(prisma, "$transaction").mockRejectedValue(Object.assign(new Error("deadlock"), { code: "P2034" }));
      await expect(remove("cat_frozen")).rejects.toThrow("deadlock");
      expect(transaction).toHaveBeenCalledTimes(1);
    });
  });

  it("changes nothing at all when a step of the delete fails: the items stay under the section", async () => {
    const { recipe, entry } = await fileUnder("cat_frozen");
    // The moves run first and the delete last: a trigger that refuses the delete makes the whole transaction roll back.
    // Raw SQL does not go through the schema the client is given, so every name carries it: `public` must never be touched.
    const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
    expect(schema).toMatch(/^test_/);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${schema}".refuse_category_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'no'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER refuse BEFORE DELETE ON "${schema}"."GroceryCategory" FOR EACH ROW EXECUTE FUNCTION "${schema}".refuse_category_delete()`);
    const before = await sections();
    try {
      await expect(remove("cat_frozen")).rejects.toThrow();

      expect(await sections()).toEqual(before);
      expect((await prisma.ingredient.findMany({ where: { recipeId: recipe.id } })).map((row) => row.categoryId)).toEqual(["cat_frozen", "cat_frozen"]);
      expect((await prisma.groceryEntry.findUniqueOrThrow({ where: { id: entry.id } })).categoryId).toBe("cat_frozen");
      expectNotRevalidated();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER refuse ON "${schema}"."GroceryCategory"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${schema}".refuse_category_delete()`);
    }
  });
});

describe("a change made while a refusal is on screen (the forms post clear=1)", () => {
  it("sends the page back to its bare address, so the alert does not outlive the change", async () => {
    await expectRedirect(renameGroceryCategory(formData({ id: "cat_pantry", name: "Cupboard", clear: "1" })), PAGE);
    expect((await sections()).find((row) => row.id === "cat_pantry")?.name).toBe("Cupboard");

    await expectRedirect(moveGroceryCategory(formData({ id: "cat_bakery", direction: "up", clear: "1" })), PAGE);
    await expectRedirect(addGroceryCategory(formData({ name: "Pet food", clear: "1" })), PAGE);
    await expectRedirect(deleteGroceryCategory(formData({ id: "cat_drinks", clear: "1" })), PAGE);
  });

  it("does not redirect without it, so the page keeps its client state", async () => {
    await expectSuccess(moveGroceryCategory(formData({ id: "cat_bakery", direction: "up" })));
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
  });
});

describe("every action", () => {
  it("starts from the seeded sections in every test (the clean-up put them back)", async () => {
    expect(await sections()).toEqual(SEEDED_CATEGORIES.map((category) => ({ ...category })));
  });
});
