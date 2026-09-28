import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_SERVINGS } from "@/lib/planner";
import { addDays, dayKey, parseDayKey, startOfWeek, weekDays } from "@/lib/week";
import { formData } from "@/tests/support/db";
import { clearPlannedMeal, clearWeek, setPlannedMeal } from "@/app/actions/meals";

// A fixed Monday, so the tests never depend on the real clock.
const MONDAY = parseDayKey("2026-09-28")!;
const WEDNESDAY = addDays(MONDAY, 2);

async function createRecipe(name = "Pasta") {
  return prisma.recipe.create({ data: { name } });
}

async function mealOn(day: Date) {
  return prisma.plannedMeal.findUnique({ where: { date: day } });
}

/** The plan, the grocery list and the recipe pages (which show where a recipe is planned). */
function expectMealViewsRevalidated() {
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/"], ["/groceries"], ["/recipes", "layout"]]);
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

describe("setPlannedMeal", () => {
  it("plans a recipe for the day, stored at UTC midnight", async () => {
    const recipe = await createRecipe();

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, servings: "4" }));

    const rows = await prisma.plannedMeal.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].date.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(rows[0]).toMatchObject({ recipeId: recipe.id, customTitle: null, servings: 4, notes: null });
    expectMealViewsRevalidated();
  });

  it("plans a typed name that matches no recipe as a one-off dinner", async () => {
    await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "  Leftovers  " }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: null, customTitle: "Leftovers" });
    expect(await prisma.recipe.count()).toBe(1);
    expectMealViewsRevalidated();
  });

  it("plans the picked recipe when the typed name still names it", async () => {
    const recipe = await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, dinner: "pasta" }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: recipe.id, customTitle: null });
  });

  it("keeps the picked one of two recipes with the same name", async () => {
    await createRecipe("Pasta");
    const second = await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: second.id, dinner: "Pasta" }));

    expect((await mealOn(WEDNESDAY))?.recipeId).toBe(second.id);
  });

  // Without JavaScript the hidden recipe id stays in the form while the user types.
  it("plans the typed name instead of a picked recipe it no longer names", async () => {
    const recipe = await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, dinner: "Eating out" }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: null, customTitle: "Eating out" });
  });

  it("adds the typed name as a recipe when the picked recipe no longer names it", async () => {
    const picked = await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: picked.id, dinner: "Stew", newRecipe: "1" }));

    const stew = await prisma.recipe.findFirstOrThrow({ where: { name: "Stew" } });
    expect(await prisma.recipe.count()).toBe(2);
    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: stew.id, customTitle: null });
    expectMealViewsRevalidated();
  });

  it("plans the picked recipe when the dinner text is empty", async () => {
    const recipe = await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, dinner: "  " }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: recipe.id, customTitle: null });
  });

  it("links a typed name to the recipe of that name, ignoring case and spaces", async () => {
    const recipe = await createRecipe("Mushroom Risotto");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "  mushroom risotto " }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: recipe.id, customTitle: null });
    expect(await prisma.recipe.count()).toBe(1);
  });

  // A case-insensitive `equals` is an ILIKE, where these are wildcards.
  it.each([
    ["an underscore", "Shak_huka"],
    ["a percent sign", "Shak%"],
    ["only a percent sign", "%"],
  ])("does not treat %s in the typed name as a wildcard", async (_label, dinner) => {
    await createRecipe("Shakshuka");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner, newRecipe: "1" }));

    const meal = await prisma.plannedMeal.findUnique({ where: { date: WEDNESDAY }, include: { recipe: true } });
    expect(meal?.recipe?.name).toBe(dinner);
    expect(await prisma.recipe.count()).toBe(2);
  });

  // Unescaped, ILIKE reads a backslash as an escape: "Shak\huka" would plan "Shakhuka".
  it("does not treat a backslash in the typed name as an escape", async () => {
    await createRecipe("Shakhuka");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "Shak\\huka" }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: null, customTitle: "Shak\\huka" });
  });

  it("plans a typed name with wildcard characters as a one-off dinner, not as a similar recipe", async () => {
    await createRecipe("Shakshuka");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "Shak_huka" }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: null, customTitle: "Shak_huka" });
  });

  it("links a typed name with wildcard characters to the recipe of exactly that name", async () => {
    await createRecipe("Shakshuka");
    const literal = await createRecipe("100% Shak_huka");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "100% shak_HUKA" }));

    expect((await mealOn(WEDNESDAY))?.recipeId).toBe(literal.id);
  });

  it("links a typed name to the oldest of several recipes with that name", async () => {
    const oldest = await createRecipe("Pasta");
    await createRecipe("Pasta");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "Pasta" }));

    expect((await mealOn(WEDNESDAY))?.recipeId).toBe(oldest.id);
  });

  it("adds a new recipe with just the name and plans it, when asked to", async () => {
    await setPlannedMeal(
      formData({ day: dayKey(WEDNESDAY), dinner: "  Shakshuka ", newRecipe: "1", servings: "3" }),
    );

    const recipes = await prisma.recipe.findMany({ include: { ingredients: true } });
    expect(recipes).toHaveLength(1);
    expect(recipes[0]).toMatchObject({ name: "Shakshuka", servings: 2, ingredients: [] });
    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: recipes[0].id, customTitle: null, servings: 3 });
    expectMealViewsRevalidated();
  });

  it("plans the existing recipe instead of adding a duplicate", async () => {
    const recipe = await createRecipe("Shakshuka");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "SHAKSHUKA", newRecipe: "1" }));

    expect(await prisma.recipe.count()).toBe(1);
    expect((await mealOn(WEDNESDAY))?.recipeId).toBe(recipe.id);
    expectMealViewsRevalidated();
  });

  it("adds no recipe for anything but newRecipe=1", async () => {
    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "Shakshuka", newRecipe: "yes" }));

    expect(await prisma.recipe.count()).toBe(0);
    expect(await mealOn(WEDNESDAY)).toMatchObject({ customTitle: "Shakshuka" });
  });

  it("stores trimmed notes, and null for whitespace-only notes", async () => {
    const recipe = await createRecipe();

    await setPlannedMeal(
      formData({ day: dayKey(MONDAY), recipeId: recipe.id, notes: "  double the garlic " }),
    );
    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, notes: "   " }));

    expect((await mealOn(MONDAY))?.notes).toBe("double the garlic");
    expect((await mealOn(WEDNESDAY))?.notes).toBeNull();
  });

  it("updates the existing row for the day instead of adding a second one", async () => {
    const first = await createRecipe("Pasta");
    const second = await createRecipe("Curry");

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: first.id, notes: "old" }));
    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: second.id, servings: "3" }));

    const rows = await prisma.plannedMeal.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipeId: second.id, servings: 3, notes: null });
  });

  it("switching a day from a recipe to a one-off dinner clears the recipe", async () => {
    const recipe = await createRecipe();
    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id }));

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "Eating out" }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ recipeId: null, customTitle: "Eating out" });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", "   "],
    ["zero", "0"],
    ["negative", "-3"],
    ["not a number", "many"],
  ])("defaults servings to 2 when the value is %s", async (_label, servings) => {
    const recipe = await createRecipe();
    const fields: Record<string, string> = { day: dayKey(WEDNESDAY), recipeId: recipe.id };
    if (servings !== undefined) fields.servings = servings;

    await setPlannedMeal(formData(fields));

    expect((await mealOn(WEDNESDAY))?.servings).toBe(2);
  });

  // The day saves by itself and cannot show an error, so too many servings are capped.
  it.each(["100", "99999999999"])("caps servings of %s at MAX_SERVINGS", async (servings) => {
    const recipe = await createRecipe();

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, servings }));

    expect((await mealOn(WEDNESDAY))?.servings).toBe(MAX_SERVINGS);
  });

  it("drops NUL characters from the dinner and the note instead of crashing", async () => {
    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), dinner: "Take\u0000away", notes: "late\u0000" }));

    expect(await mealOn(WEDNESDAY)).toMatchObject({ customTitle: "Takeaway", notes: "late" });
  });

  it("rounds fractional servings down to a whole number", async () => {
    const recipe = await createRecipe();

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: recipe.id, servings: "3.7" }));

    expect((await mealOn(WEDNESDAY))?.servings).toBe(3);
  });

  it.each([
    ["an empty choice", { recipeId: "", dinner: "" }],
    ["no choice field at all", {}],
    ["a whitespace-only dinner", { dinner: "   " }],
    ["a blank name to add as a recipe", { dinner: " ", newRecipe: "1" }],
  ])("clears the day on %s", async (_label, fields) => {
    await prisma.plannedMeal.create({ data: { date: WEDNESDAY, customTitle: "Leftovers" } });
    await prisma.plannedMeal.create({ data: { date: MONDAY, customTitle: "Soup" } });

    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), ...fields }));

    expect(await mealOn(WEDNESDAY)).toBeNull();
    expect(await mealOn(MONDAY)).not.toBeNull();
    expectMealViewsRevalidated();
  });

  it("clearing a day that has nothing planned is a harmless no-op", async () => {
    await setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: "" }));

    expect(await prisma.plannedMeal.count()).toBe(0);
    expectMealViewsRevalidated();
  });

  it("ignores extra form fields", async () => {
    const recipe = await createRecipe();

    await setPlannedMeal(
      formData({
        day: dayKey(WEDNESDAY),
        recipeId: recipe.id,
        date: "1999-01-01",
        createdAt: "1999-01-01",
        whatever: "x",
      }),
    );

    const rows = await prisma.plannedMeal.findMany();
    expect(rows).toHaveLength(1);
    expect(dayKey(rows[0].date)).toBe("2026-09-30");
  });

  it("rejects an unknown recipe id without writing anything", async () => {
    await expect(
      setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: "no-such-recipe" })),
    ).rejects.toThrow();

    expect(await prisma.plannedMeal.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("adds no recipe when the picked recipe id is unknown", async () => {
    await expect(
      setPlannedMeal(formData({ day: dayKey(WEDNESDAY), recipeId: "no-such-recipe", dinner: "Stew", newRecipe: "1" })),
    ).rejects.toThrow(/`recipeId`/);

    expect(await prisma.recipe.count()).toBe(0);
    expect(await prisma.plannedMeal.count()).toBe(0);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["an instant instead of a day", "2026-09-30T12:00:00Z"],
    ["not a date", "tomorrow"],
    ["an overflowing date", "2026-02-31"],
    ["in the wrong order", "30-09-2026"],
  ])("throws when the day is %s", async (_label, day) => {
    const fields: Record<string, string> = { dinner: "Leftovers" };
    if (day !== undefined) fields.day = day;

    await expect(setPlannedMeal(formData(fields))).rejects.toThrow(/`day`/);

    expect(await prisma.plannedMeal.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a day key padded with whitespace", async () => {
    await setPlannedMeal(formData({ day: ` ${dayKey(WEDNESDAY)} `, dinner: "Leftovers" }));

    expect(await mealOn(WEDNESDAY)).not.toBeNull();
  });
});

describe("clearPlannedMeal", () => {
  it("removes only the given day and revalidates plan and groceries", async () => {
    await prisma.plannedMeal.create({ data: { date: MONDAY, customTitle: "Soup" } });
    await prisma.plannedMeal.create({ data: { date: WEDNESDAY, customTitle: "Leftovers" } });

    await clearPlannedMeal(formData({ day: dayKey(WEDNESDAY) }));

    expect(await mealOn(WEDNESDAY)).toBeNull();
    expect(await mealOn(MONDAY)).not.toBeNull();
    expectMealViewsRevalidated();
  });

  it("does nothing, without failing, for a day with nothing planned", async () => {
    await clearPlannedMeal(formData({ day: dayKey(WEDNESDAY) }));

    expect(await prisma.plannedMeal.count()).toBe(0);
    expectMealViewsRevalidated();
  });

  it.each([["missing", undefined], ["whitespace-only", "  "], ["malformed", "2026-13-01"]])(
    "throws when the day is %s",
    async (_label, day) => {
      await prisma.plannedMeal.create({ data: { date: WEDNESDAY, customTitle: "Leftovers" } });

      await expect(
        clearPlannedMeal(formData(day === undefined ? {} : { day })),
      ).rejects.toThrow(/`day`/);

      expect(await prisma.plannedMeal.count()).toBe(1);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("clearWeek", () => {
  async function planEveryDay(from: Date, to: Date) {
    for (let day = from; day <= to; day = addDays(day, 1)) {
      await prisma.plannedMeal.create({ data: { date: day, customTitle: dayKey(day) } });
    }
  }

  it("removes all seven days of the week and nothing either side of it", async () => {
    await planEveryDay(addDays(MONDAY, -3), addDays(MONDAY, 10));

    await clearWeek(formData({ weekStart: dayKey(MONDAY) }));

    const left = (await prisma.plannedMeal.findMany({ orderBy: { date: "asc" } })).map((m) =>
      dayKey(m.date),
    );
    const cleared = weekDays(MONDAY).map(dayKey);
    expect(left).toEqual(["2026-09-25", "2026-09-26", "2026-09-27", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(left.some((key) => cleared.includes(key))).toBe(false);
    expectMealViewsRevalidated();
  });

  it("clears the week across the October daylight saving change", async () => {
    // Berlin leaves summer time on 25 Oct 2026; the week of 19 Oct spans it.
    const weekStart = startOfWeek(parseDayKey("2026-10-21")!);
    await planEveryDay(addDays(weekStart, -1), addDays(weekStart, 7));

    await clearWeek(formData({ weekStart: dayKey(weekStart) }));

    const left = (await prisma.plannedMeal.findMany({ orderBy: { date: "asc" } })).map((m) =>
      dayKey(m.date),
    );
    expect(left).toEqual(["2026-10-18", "2026-10-26"]);
  });

  it("succeeds on an empty week", async () => {
    await clearWeek(formData({ weekStart: dayKey(MONDAY) }));

    expectMealViewsRevalidated();
  });

  it.each([["missing", undefined], ["empty", ""], ["malformed", "2026-W40"]])(
    "throws when weekStart is %s",
    async (_label, weekStart) => {
      await planEveryDay(MONDAY, addDays(MONDAY, 6));

      await expect(
        clearWeek(formData(weekStart === undefined ? {} : { weekStart })),
      ).rejects.toThrow(/`weekStart`/);

      expect(await prisma.plannedMeal.count()).toBe(7);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("clears the Monday-based week of a non-Monday weekStart, and nothing else", async () => {
    await planEveryDay(MONDAY, addDays(MONDAY, 13));

    await clearWeek(formData({ weekStart: dayKey(WEDNESDAY) }));

    expect(await prisma.plannedMeal.count({ where: { date: { lt: addDays(MONDAY, 7) } } })).toBe(0);
    expect(await prisma.plannedMeal.count({ where: { date: { gte: addDays(MONDAY, 7) } } })).toBe(7);
  });
});
