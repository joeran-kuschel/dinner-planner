/**
 * Rules the day card and `setPlannedMeal` must agree on, so they live here
 * rather than in either of them.
 */

/** The most people one dinner or recipe can be planned for; matches the inputs' `max`. */
export const MAX_SERVINGS = 99;

/**
 * A dinner name as compared: trimmed and case-insensitive. `toLowerCase`, not
 * `toLocaleLowerCase`, so the browser and the server agree whatever their locale.
 */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Whether a typed dinner names this recipe. The server links such a name to
 * the existing recipe rather than storing a one-off title or a duplicate.
 */
export function isSameDinner(recipeName: string, typed: string): boolean {
  return normalize(recipeName) === normalize(typed);
}

/** Whether a recipe belongs in the suggestions for what the user has typed so far. */
export function suggestsRecipe(recipeName: string, typed: string): boolean {
  return normalize(recipeName).includes(normalize(typed));
}

/**
 * The tag that makes a recipe a suggestion although its name does not contain what was
 * typed, if there is one. A recipe whose name matches needs no tag to be found, so the
 * suggestion does not mention one.
 */
export function matchingTag(recipe: { name: string; tags: string[] }, typed: string): string | null {
  if (!normalize(typed) || suggestsRecipe(recipe.name, typed)) return null;
  return recipe.tags.find((tag) => normalize(tag).includes(normalize(typed))) ?? null;
}
