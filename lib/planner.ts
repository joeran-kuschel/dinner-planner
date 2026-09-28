/**
 * The value the day dropdown submits when the user chooses "Something else…"
 * and types their own title instead of picking a recipe.
 *
 * Client and server both need it — the select puts it in the `recipeId` field,
 * and the action has to recognise it rather than storing it as a recipe id — so
 * it lives here rather than in either component.
 */
export const CUSTOM_MEAL = "__custom__";

/** The most people one dinner or recipe can be planned for; matches the inputs' `max`. */
export const MAX_SERVINGS = 99;
