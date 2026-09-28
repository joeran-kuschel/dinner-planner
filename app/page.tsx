import Link from "next/link";
import { clearWeek } from "@/app/actions/meals";
import { DayCard } from "@/components/day-card";
import { prisma } from "@/lib/db";
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
  const weekStart = resolveWeekStart(typeof week === "string" ? week : null);
  const days = weekDays(weekStart);
  const currentDay = today();

  const [meals, recipes] = await Promise.all([
    prisma.plannedMeal.findMany({
      where: { date: { gte: weekStart, lt: addDays(weekStart, 7) } },
    }),
    prisma.recipe.findMany({
      select: { id: true, name: true },
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
          <h1 className="text-2xl font-semibold tracking-tight">Dinner plan</h1>
          <p className="mt-1 text-sm text-muted">
            {formatWeekRange(weekStart)} · {plannedCount} of 7 planned
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/?week=${dayKey(addDays(weekStart, -7))}`}
            className="btn-secondary"
            aria-label="Previous week"
          >
            ←
          </Link>
          <Link href="/" className="btn-secondary">
            This week
          </Link>
          <Link
            href={`/?week=${dayKey(addDays(weekStart, 7))}`}
            className="btn-secondary"
            aria-label="Next week"
          >
            →
          </Link>
        </div>
      </header>

      {recipes.length === 0 && (
        <p className="card p-4 text-sm text-muted">
          No recipes yet.{" "}
          <Link href="/recipes/new" className="font-medium text-accent underline">
            Add your first one
          </Link>{" "}
          and it will be suggested for every day.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((day) => {
          const key = dayKey(day);
          const meal = mealsByDay.get(key) ?? null;
          return (
            <DayCard
              key={key}
              dayKey={key}
              weekdayLabel={formatWeekday(day)}
              dateLabel={formatDayMonth(day)}
              isToday={isSameDay(day, currentDay)}
              recipes={recipes}
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
          Grocery list for this week
        </Link>
        {plannedCount > 0 && (
          <form action={clearWeek}>
            <input type="hidden" name="weekStart" value={dayKey(weekStart)} />
            <button type="submit" className="btn-ghost">
              Clear the whole week
            </button>
          </form>
        )}
      </footer>
    </div>
  );
}
