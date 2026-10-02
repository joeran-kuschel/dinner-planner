import { plural, t } from "@lingui/core/macro";
import Link from "next/link";
import { addGroceryExtra } from "@/app/actions/groceries";
import { GroceryList, type GroceryListLine } from "@/components/grocery-list";
import { PantrySection } from "@/components/pantry-section";
import { RequiredMark, RequiredNote } from "@/components/required-mark";
import { WeekNav } from "@/components/week-nav";
import { prisma } from "@/lib/db";
import { CategorySelect } from "@/components/category-select";
import { getServerI18n } from "@/lib/i18n/server";
import { aggregateIngredients, type GroceryLine, mealSources } from "@/lib/grocery";
import { applyStaples, normalizeStaple } from "@/lib/pantry";
import { addDays, dayKey, formatWeekRange, resolveWeekStart } from "@/lib/week";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`Groceries` };
}

export default async function GroceriesPage({ searchParams }: PageProps<"/groceries">) {
  const { week, pantry } = await searchParams;
  const showPantry = pantry === "show";
  const { i18n, locale } = await getServerI18n();
  const weekStart = resolveWeekStart(typeof week === "string" ? week : null);
  const weekKey = dayKey(weekStart);

  const [meals, entries, staples, ingredientNames] = await Promise.all([
    prisma.plannedMeal.findMany({
      where: { date: { gte: weekStart, lt: addDays(weekStart, 7) } },
      include: { recipe: { include: { ingredients: { orderBy: { position: "asc" } } } } },
    }),
    prisma.groceryEntry.findMany({ where: { weekStart } }),
    prisma.pantryStaple.findMany({ orderBy: { name: "asc" } }),
    // What a staple can be, offered while typing one.
    prisma.ingredient.findMany({ select: { name: true }, distinct: ["name"], orderBy: { name: "asc" } }),
  ]);

  const entriesByKey = new Map(entries.map((entry) => [entry.key, entry]));

  // Derived lines come from the plan; stored entries only contribute tick state.
  const derived: (GroceryLine & { entryId: string | null })[] = aggregateIngredients(
    meals.map((meal) => ({
      servings: meal.servings,
      recipe: meal.recipe && {
        name: meal.recipe.name,
        servings: meal.recipe.servings,
        ingredients: meal.recipe.ingredients.map(({ name, quantity, unit, category }) => ({
          name,
          quantity,
          unit,
          category,
        })),
      },
    })),
  ).map((line) => {
    const entry = entriesByKey.get(line.key);
    return {
      ...line,
      manual: false,
      // A line added by hand with this name and unit is shown as this one line; a staple must not hide it.
      handAdded: entry?.manual ?? false,
      checked: entry?.checked ?? false,
      entryId: entry?.id ?? null,
    };
  });

  const derivedKeys = new Set(derived.map((line) => line.key));

  // Manual extras that do not collide with a derived line are listed alongside.
  const extras = entries
    .filter((entry) => entry.manual && !derivedKeys.has(entry.key))
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      quantity: entry.quantity,
      unit: entry.unit,
      category: entry.category,
      sources: [] as string[],
      manual: true,
      checked: entry.checked,
      entryId: entry.id,
    }));

  const allLines = [...derived, ...extras].sort((a, b) => a.label.localeCompare(b.label));
  // A pantry staple only decides which derived lines are shown; nothing about a line is stored for it.
  const pantryView = applyStaples(
    allLines,
    staples.map((staple) => staple.name),
    showPantry,
  );
  const lines: GroceryListLine[] = pantryView.lines;
  const suggestions = [...new Set(ingredientNames.map(({ name }) => normalizeStaple(name)).filter(Boolean))];
  const { recipes: recipeCount, typed: typedCount } = mealSources(meals);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t(i18n)`Grocery list`}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatWeekRange(weekStart, locale)} ·{" "}
            {t(i18n)`from ${plural(recipeCount, { one: "# recipe", other: "# recipes" })}`}
            {typedCount > 0 &&
              ` · ${t(i18n)`${plural(typedCount, {
                one: "# dinner without a recipe adds nothing",
                other: "# dinners without a recipe add nothing",
              })}`}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/?week=${weekKey}`} className="btn-secondary">
            {t(i18n)`Edit the plan`}
          </Link>
          <WeekNav
            basePath="/groceries"
            weekStart={weekStart}
            i18n={i18n}
            thisWeekLabel={t(i18n)`This week's list`}
          />
        </div>
      </header>

      {/* Closed, so the list stays the first thing on the page. It stays open while the visitor keeps adding
          items (the page re-renders without touching `open`) and starts closed again for another week. */}
      <details key={weekKey} className="card p-4">
        <summary className="disclosure-summary">{t(i18n)`Add something else`}</summary>
        <form action={addGroceryExtra} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="weekStart" value={weekKey} />
          <div className="basis-full">
            <RequiredNote>{t(i18n)`required`}</RequiredNote>
          </div>
          <div>
            <label className="label" htmlFor="quantity">
              {t(i18n)`Amount`}
            </label>
            <input id="quantity" name="quantity" className="field mt-1 w-20" inputMode="decimal" />
          </div>
          <div>
            <label className="label" htmlFor="unit">
              {t(i18n)`Unit`}
            </label>
            <input id="unit" name="unit" className="field mt-1 w-20" placeholder={t(i18n)`g`} />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="label">
              {t(i18n)`Item`} <RequiredMark title={t(i18n)`Required`} />
            </label>
            <input
              id="label"
              name="label"
              className="field mt-1"
              required
              placeholder={t(i18n)`Washing-up liquid`}
            />
          </div>
          <div>
            <label className="label" htmlFor="category">
              {t(i18n)`Category`}
            </label>
            <CategorySelect id="category" name="category" className="field mt-1" />
          </div>
          <button type="submit" className="btn-primary">
            {t(i18n)`Add`}
          </button>
        </form>
      </details>

      <GroceryList weekStart={weekKey} lines={lines} allInPantry={pantryView.allInPantry} />

      <PantrySection
        staples={staples}
        hiddenCount={pantryView.hiddenCount}
        showHidden={showPantry}
        toggleHref={`/groceries?week=${weekKey}${showPantry ? "" : "&pantry=show"}`}
        suggestions={suggestions}
      />
    </div>
  );
}
