/**
 * The orders the recipe list can be in. Safe for client code (the sort select is a client component).
 * `name` and `newest` are database orders; `planned` and `recent` need when a recipe was last planned (`lib/cook-again.ts`).
 */

import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

export const RECIPE_SORTS = ["name", "newest", "planned", "recent"] as const;

export type RecipeSort = (typeof RECIPE_SORTS)[number];

/** The order when the address names none or one that does not exist; it is left out of the address. */
export const DEFAULT_RECIPE_SORT: RecipeSort = "name";

/** A sort from the address; anything else is the default. */
export const parseRecipeSort = (raw: string): RecipeSort => RECIPE_SORTS.find((sort) => sort === raw) ?? DEFAULT_RECIPE_SORT;

export function recipeSortLabel(sort: RecipeSort, i18n: I18n): string {
  switch (sort) {
    case "name":
      return t(i18n)`Name (A–Z)`;
    case "newest":
      return t(i18n)`Newest first`;
    case "planned":
      return t(i18n)`Planned longest ago`;
    case "recent":
      return t(i18n)`Planned most recently`;
  }
}
