import { plural, t } from "@lingui/core/macro";
import Link from "next/link";
import { addGroceryExtra, resetGroceryTicks } from "@/app/actions/groceries";
import { GroceryList } from "@/components/grocery-list";
import { RequiredMark, RequiredNote } from "@/components/required-mark";
import { WeekNav } from "@/components/week-nav";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/i18n/server";
import { aggregateIngredients, type GroceryLine } from "@/lib/grocery";
import { addDays, dayKey, formatWeekRange, resolveWeekStart } from "@/lib/week";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`Groceries` };
}

export default async function GroceriesPage({ searchParams }: PageProps<"/groceries">) {
  const { week } = await searchParams;
  const { i18n, locale } = await getServerI18n();
  const weekStart = resolveWeekStart(typeof week === "string" ? week : null);
  const weekKey = dayKey(weekStart);

  const [meals, entries] = await Promise.all([
    prisma.plannedMeal.findMany({
      where: { date: { gte: weekStart, lt: addDays(weekStart, 7) } },
      include: { recipe: { include: { ingredients: { orderBy: { position: "asc" } } } } },
    }),
    prisma.groceryEntry.findMany({ where: { weekStart } }),
  ]);

  const entriesByKey = new Map(entries.map((entry) => [entry.key, entry]));

  // Derived lines come from the plan; stored entries only contribute tick state.
  const derived: (GroceryLine & { entryId: string | null })[] = aggregateIngredients(
    meals.map((meal) => ({
      servings: meal.servings,
      recipe: meal.recipe && {
        name: meal.recipe.name,
        servings: meal.recipe.servings,
        ingredients: meal.recipe.ingredients.map(({ name, quantity, unit }) => ({
          name,
          quantity,
          unit,
        })),
      },
    })),
  ).map((line) => {
    const entry = entriesByKey.get(line.key);
    return { ...line, manual: false, checked: entry?.checked ?? false, entryId: entry?.id ?? null };
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
      sources: [] as string[],
      manual: true,
      checked: entry.checked,
      entryId: entry.id,
    }));

  const lines = [...derived, ...extras].sort((a, b) => a.label.localeCompare(b.label));
  const plannedMeals = meals.filter((meal) => meal.recipe !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(i18n)`Grocery list`}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatWeekRange(weekStart, locale)} ·{" "}
            {t(i18n)`from ${plural(plannedMeals, { one: "# recipe", other: "# recipes" })}`}
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

      <GroceryList weekStart={weekKey} lines={lines} />

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">{t(i18n)`Add something else`}</h2>
        <form action={addGroceryExtra} className="flex flex-wrap items-end gap-2">
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
          <button type="submit" className="btn-primary">
            {t(i18n)`Add`}
          </button>
        </form>
      </section>

      {lines.some((line) => line.checked) && (
        <form action={resetGroceryTicks} className="border-t border-border pt-4">
          <input type="hidden" name="weekStart" value={weekKey} />
          <button type="submit" className="btn-ghost">
            {t(i18n)`Untick everything`}
          </button>
        </form>
      )}
    </div>
  );
}
