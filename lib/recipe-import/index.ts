import { ImportError } from "@/lib/recipe-import/errors";
import { recipeFromHtml } from "@/lib/recipe-import/jsonld";
import { fetchPage, type FetchOptions } from "@/lib/recipe-import/safe-fetch";
import type { RecipeFormValues } from "@/lib/recipe-form";

/**
 * Whether the import may fetch private addresses. Only the end-to-end tests set this (their sample page is served
 * from this machine); `tests/infra` checks that no manifest does. Never set it for a real deployment.
 */
export const allowPrivateAddresses = () => process.env.RECIPE_IMPORT_ALLOW_PRIVATE === "1";

/** The recipe form's values for the recipe at `rawUrl`. Throws an `ImportError`. Server only. */
export async function importRecipe(rawUrl: string, options: FetchOptions = {}): Promise<RecipeFormValues> {
  const page = await fetchPage(rawUrl, { allowPrivateAddresses: allowPrivateAddresses(), ...options });
  const values = recipeFromHtml(page.html, page.url);
  if (!values) throw new ImportError("no-recipe");
  return values;
}
