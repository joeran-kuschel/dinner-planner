import type { Locale } from "@/lib/i18n/config";
import { addDays, dayKey, formatDayMonth, formatWeekday } from "@/lib/week";

/**
 * Leftovers: a day that is the rest of an earlier dinner. Shared by the week page, the day cards and
 * `setLeftovers`, so they agree on how far back a dinner reaches and what counts as a dinner.
 */

/** How many days before a day the dinner it eats the rest of can be. */
export const LEFTOVERS_DAYS = 6;

/** A dinner an empty day could eat the rest of, as the dialog lists it. */
export type LeftoverSource = { key: string; weekday: string; dateLabel: string; title: string };

type PlannedRow = { recipeId: string | null; customTitle: string | null; leftoversOf: Date | null };

/** A dinner of its own (a recipe or a typed name), as opposed to an empty row or leftovers. */
export function isDinner(meal: PlannedRow | null | undefined): boolean {
  return Boolean(meal && !meal.leftoversOf && (meal.recipeId || meal.customTitle));
}

/** Whether the day shows as planned: a dinner, or leftovers. */
export function isPlanned(meal: PlannedRow | null | undefined): boolean {
  return Boolean(meal && (meal.leftoversOf || meal.recipeId || meal.customTitle));
}

/**
 * The dinners of the `LEFTOVERS_DAYS` days before `day` that it could eat the rest of, the nearest first.
 * `mealsByDay` is keyed by `dayKey`; `recipeNames` names the recipes the dinners point to.
 */
export function leftoverSourcesFor(
  day: Date,
  mealsByDay: ReadonlyMap<string, PlannedRow>,
  recipeNames: ReadonlyMap<string, string>,
  locale: Locale,
): LeftoverSource[] {
  return Array.from({ length: LEFTOVERS_DAYS }, (_, index) => addDays(day, -(index + 1))).flatMap((earlier) => {
    const row = mealsByDay.get(dayKey(earlier));
    if (!row || !isDinner(row)) return [];
    const title = (row.recipeId ? recipeNames.get(row.recipeId) : null) ?? row.customTitle ?? "";
    return [{ key: dayKey(earlier), weekday: formatWeekday(earlier, locale), dateLabel: formatDayMonth(earlier, locale), title }];
  });
}

/** How many days eat the rest of the dinner on `day`. */
export function leftoverCountFor(day: Date, meals: Iterable<Pick<PlannedRow, "leftoversOf">>): number {
  let count = 0;
  for (const meal of meals) if (meal.leftoversOf?.getTime() === day.getTime()) count++;
  return count;
}
