/**
 * Favorites and "cook again": which recipes to suggest, in which order, and how to say when one was last planned.
 * Safe for client code (the week page works the numbers out on the server, so the browser's clock is never involved).
 *
 * The app knows what was planned, not what was cooked, so every text says "planned".
 */

import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import { normalizeTag } from "@/lib/tags";

const MS_PER_DAY = 86_400_000;

/** The most recipes "Cook again" shows. */
export const COOK_AGAIN_LIMIT = 5;
/**
 * Recipes with one of these tags are never offered in "Cook again": a cocktail or a base recipe (a stock, a dough) is not
 * what you plan a dinner from. Compared as tags are stored (lowercase, normalised).
 */
export const COOK_AGAIN_EXCLUDED_TAGS: readonly string[] = ["cocktail", "cocktails", "base recipe", "base recipes"];

/** A recipe is due for "Cook again" once it was last planned this many days ago (or never). */
export const COOK_AGAIN_AFTER_DAYS = 14;

/** What the suggestions know about a recipe. `daysSince` is null for a recipe never planned and undefined when not known. */
export type RecipeActivity = { favorite?: boolean; daysSince?: number | null };

/** Whole days from the day a recipe was last planned to today (both planner days, UTC midnight); never negative. */
export function daysSince(lastPlanned: Date, today: Date): number {
  return Math.max(0, Math.round((today.getTime() - lastPlanned.getTime()) / MS_PER_DAY));
}

/**
 * The order of the suggestions for an empty dinner field: favorites first, then by the longest time since the recipe was
 * planned, a recipe never planned after the ones that were (in each group). Where that is equal the given order stays
 * (the pages hand the recipes over sorted by name).
 */
export function rankForSuggestion<T extends RecipeActivity>(recipes: readonly T[]): T[] {
  return [...recipes].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || ago(b) - ago(a));
}

/** How long ago a recipe was planned, for sorting: a recipe never planned (or not known) counts as the least. */
const ago = (recipe: RecipeActivity) => (typeof recipe.daysSince === "number" ? recipe.daysSince : -1);

/** Days since a recipe was planned for the list's sorts, a recipe never planned (or not known) counting as longer than any. */
const since = (recipe: RecipeActivity) => (typeof recipe.daysSince === "number" ? recipe.daysSince : Infinity);

const compare = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

/** The recipe list with the recipe planned longest ago first, the ones never planned before all of them; equal ones keep their order. */
export function sortByLongestAgo<T extends RecipeActivity>(recipes: readonly T[]): T[] {
  return [...recipes].sort((a, b) => compare(since(b), since(a)));
}

/** The recipe list with the recipe planned most recently first, the ones never planned after all of them; equal ones keep their order. */
export function sortByMostRecent<T extends RecipeActivity>(recipes: readonly T[]): T[] {
  return [...recipes].sort((a, b) => compare(since(a), since(b)));
}

/**
 * The recipes "Cook again" offers: those not planned in the week shown, without an excluded tag, that are due (planned at least
 * `COOK_AGAIN_AFTER_DAYS` days ago, or never), ranked as above, at most `COOK_AGAIN_LIMIT`.
 */
export function cookAgainSuggestions<T extends RecipeActivity & { id: string; name: string; tags?: readonly string[] }>(
  recipes: readonly T[],
  plannedThisWeek: ReadonlySet<string>,
  limit = COOK_AGAIN_LIMIT,
): T[] {
  const due = recipes.filter(
    (recipe) =>
      !plannedThisWeek.has(recipe.id) &&
      !recipe.tags?.some((tag) => COOK_AGAIN_EXCLUDED_TAGS.includes(normalizeTag(tag))) &&
      (recipe.daysSince === null || recipe.daysSince === undefined || recipe.daysSince >= COOK_AGAIN_AFTER_DAYS),
  );
  return rankForSuggestion(due).slice(0, limit);
}

/** When a recipe was last planned, in words: "last planned 3 weeks ago", "never planned". */
export function plannedAgoText(days: number | null, i18n: I18n): string {
  if (days === null) return t(i18n)`never planned`;
  if (days === 0) return t(i18n)`last planned today`;
  if (days === 1) return t(i18n)`last planned yesterday`;
  if (days < 14) return t(i18n)`last planned ${plural(days, { one: "# day ago", other: "# days ago" })}`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return t(i18n)`last planned ${plural(weeks, { one: "# week ago", other: "# weeks ago" })}`;
  }
  if (days < 730) {
    const months = Math.floor(days / 30);
    return t(i18n)`last planned ${plural(months, { one: "# month ago", other: "# months ago" })}`;
  }
  const years = Math.floor(days / 365);
  return t(i18n)`last planned ${plural(years, { one: "# year ago", other: "# years ago" })}`;
}

/** The line under a suggestion: "Favorite · last planned 3 weeks ago". Empty when nothing is known about the recipe. */
export function activityHint({ favorite, daysSince: days }: RecipeActivity, i18n: I18n): string {
  const parts = [favorite ? t(i18n)`Favorite` : null, days === undefined ? null : plannedAgoText(days, i18n)];
  return parts.filter(Boolean).join(" · ");
}
