/**
 * Shared shape of the recipe form's state.
 *
 * This lives outside `app/actions/recipes.ts` because a `"use server"` module
 * may only export async functions — exporting the constant from there is a
 * runtime error in Next.js, even though it type-checks.
 */

import type { MessageDescriptor } from "@lingui/core";

/** The longest prep time a recipe can have, in minutes (one day); matches the input's `max`. */
export const MAX_PREP_MINUTES = 1440;

/**
 * Whether a recipe source can be shown as a link: only http(s), so a stored
 * `javascript:` or `data:` address can never be clicked.
 */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** One ingredient row exactly as it was typed, before any parsing. */
export type IngredientValues = { name: string; quantity: string; unit: string; category: string };

/** The whole form as typed. Kept as strings so a rejected submission can be
 *  put back on screen verbatim. */
export type RecipeFormValues = {
  name: string;
  description: string;
  servings: string;
  prepMinutes: string;
  sourceUrl: string;
  instructions: string;
  /** What the photo shows, for screen readers. The photo file itself cannot be echoed back. */
  photoAlt: string;
  ingredients: IngredientValues[];
};

export type RecipeFormState = {
  /**
   * What is wrong, as a message for the form to translate: the server does not
   * render the error, and the user may switch language while it is shown.
   */
  error: MessageDescriptor | null;
  /**
   * Echo of the rejected submission. React 19 resets a form once its action
   * resolves, so without handing the values back the user's typing would be
   * thrown away by a validation error.
   */
  values: RecipeFormValues | null;
  /** Bumped per rejected attempt, so the form re-applies `values` every time. */
  attempt: number;
};

export const EMPTY_RECIPE_FORM_STATE: RecipeFormState = {
  error: null,
  values: null,
  attempt: 0,
};
