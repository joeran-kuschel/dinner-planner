import { plural, t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import { clearWeek } from "@/app/actions/meals";
import { ConfirmAction } from "@/components/confirm-action";
import { DayCard } from "@/components/day-card";
import { WeekNav } from "@/components/week-nav";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/i18n/server";
import {
  addDays,
  dayKey,
  formatDayMonth,
  formatWeekRange,
  formatWeekday,
  isSameDay,
  resolveWeekStart,
  today,
  weekDays,
} from "@/lib/week";

export default async function WeekPlanPage({ searchParams }: PageProps<"/">) {
  const { week } = await searchParams;
  const { i18n, locale } = await getServerI18n();
  const weekStart = resolveWeekStart(typeof week === "string" ? week : null);
  const days = weekDays(weekStart);
  const currentDay = today();

  const [meals, recipes] = await Promise.all([
    prisma.plannedMeal.findMany({
      where: { date: { gte: weekStart, lt: addDays(weekStart, 7) } },
    }),
    prisma.recipe.findMany({
      select: { id: true, name: true, tags: { select: { name: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const mealsByDay = new Map(meals.map((meal) => [dayKey(meal.date), meal]));
  // A row that names neither a recipe nor a title shows as an empty day, so it
  // must not be counted as planned either.
  const plannedCount = meals.filter((meal) => meal.recipeId || meal.customTitle).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="week-plan-title" tabIndex={-1} className="page-title">
            {t(i18n)`Dinner plan`}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatWeekRange(weekStart, locale)} ·{" "}
            {t(i18n)`${plannedCount} of 7 planned`}
          </p>
        </div>

        <WeekNav basePath="/" weekStart={weekStart} i18n={i18n} />
      </header>

      {recipes.length === 0 && (
        <p className="card p-4 text-sm text-muted">
          <Trans>
            No recipes yet.{" "}
            <Link href="/recipes/new" className="font-medium text-accent-text underline">
              Add your first one
            </Link>{" "}
            and it will be suggested for every day.
          </Trans>
        </p>
      )}

      <div className="card divide-y divide-border [&>form:first-child]:rounded-t-2xl [&>form:last-child]:rounded-b-2xl">
        {days.map((day) => {
          const key = dayKey(day);
          const meal = mealsByDay.get(key) ?? null;
          return (
            <DayCard
              key={key}
              dayKey={key}
              weekdayLabel={formatWeekday(day, locale)}
              dateLabel={formatDayMonth(day, locale)}
              isToday={isSameDay(day, currentDay)}
              recipes={recipes.map(({ id, name, tags }) => ({ id, name, tags: tags.map((tag) => tag.name) }))}
              meal={
                meal && {
                  recipeId: meal.recipeId,
                  customTitle: meal.customTitle,
                  servings: meal.servings,
                  notes: meal.notes,
                }
              }
            />
          );
        })}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Link href={`/groceries?week=${dayKey(weekStart)}`} className="btn-primary">
          {t(i18n)`Grocery list for this week`}
        </Link>
        {plannedCount > 0 && (
          <ConfirmAction
            label={t(i18n)`Clear the whole week`}
            question={t(i18n)`Remove ${plural(plannedCount, { one: "# planned dinner", other: "# planned dinners" })} from this week?`}
            confirmLabel={t(i18n)`Clear week`}
            action={clearWeek}
            fields={{ weekStart: dayKey(weekStart) }}
            openUpward
            focusAfter="week-plan-title"
          />
        )}
      </footer>
    </div>
  );
}
