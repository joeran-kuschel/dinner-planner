import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";

/**
 * The short facts about a recipe, in the user's language, e.g. "Serves 4",
 * "3 ingredients", "30 min", "next Tue 6 Oct". Counts that are not given are left
 * out, as is a missing prep time or a recipe with no planned day from today on.
 */
export function recipeFacts(
  i18n: I18n,
  facts: { servings: number; prepMinutes: number | null; ingredients?: number; nextPlanned?: string | null },
): string[] {
  const { servings, prepMinutes, ingredients, nextPlanned } = facts;
  return [
    t(i18n)`Serves ${servings}`,
    ingredients === undefined ? null : t(i18n)`${plural(ingredients, { one: "# ingredient", other: "# ingredients" })}`,
    prepMinutes ? t(i18n)`${prepMinutes} min` : null,
    nextPlanned ? t(i18n)`next ${nextPlanned}` : null,
  ].filter((fact) => fact !== null);
}
