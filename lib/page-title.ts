/**
 * Page titles. Server only (it reads the database).
 *
 * The layout's template adds " - Dinner Planner", so a page supplies only its own part. A recipe's page is
 * titled with the recipe's name, which is user text: Next escapes it, and a long one is shortened here.
 */

import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { prisma } from "@/lib/db";

/** Between a page's own part and the app's name in every title. */
export const TITLE_SEPARATOR = " - ";

/**
 * The whole title for a page in the layout's own route segment (the week plan at "/"): Next applies the layout's
 * template to the pages below it only, so this one carries the app name itself.
 */
export function absoluteTitle(part: string, i18n: I18n): { absolute: string } {
  return { absolute: `${part}${TITLE_SEPARATOR}${t(i18n)`Dinner Planner`}` };
}

/** The longest page part of a title, in characters. */
export const MAX_TITLE_LENGTH = 60;

/** A name that fits a tab: cut at `MAX_TITLE_LENGTH` characters (not in the middle of an emoji) with "…". */
export function shortenTitle(name: string): string {
  const text = name.trim().replace(/\s+/g, " ");
  const characters = Array.from(text);
  return characters.length <= MAX_TITLE_LENGTH ? text : `${characters.slice(0, MAX_TITLE_LENGTH - 1).join("").trimEnd()}…`;
}

/** The recipe's name, shortened, or null when there is no such recipe (the page then shows the app's name). */
export async function recipeTitle(id: string): Promise<string | null> {
  const recipe = await prisma.recipe.findUnique({ where: { id }, select: { name: true } });
  return recipe ? shortenTitle(recipe.name) : null;
}
