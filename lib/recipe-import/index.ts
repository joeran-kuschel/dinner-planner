import { ImportError } from "@/lib/recipe-import/errors";
import { recipeFromHtml } from "@/lib/recipe-import/jsonld";
import { sniffPhotoType, type PhotoType } from "@/lib/recipe-import/image";
import { fetchImage, fetchPage, type FetchOptions } from "@/lib/recipe-import/safe-fetch";
import type { RecipeFormValues } from "@/lib/recipe-form";

/**
 * Whether the import may fetch private addresses. Only the end-to-end tests set this (their sample page is served
 * from this machine); `tests/infra` checks that no manifest does. Never set it for a real deployment.
 */
export const allowPrivateAddresses = () => process.env.RECIPE_IMPORT_ALLOW_PRIVATE === "1";

/** The recipe at `rawUrl`: the form's values and the address of its picture, if the page names one. Throws an `ImportError`. */
export async function importRecipe(
  rawUrl: string,
  options: FetchOptions = {},
): Promise<{ values: RecipeFormValues; photoUrl: string | null }> {
  const page = await fetchPage(rawUrl, { allowPrivateAddresses: allowPrivateAddresses(), ...options });
  const recipe = recipeFromHtml(page.html, page.url);
  if (!recipe) throw new ImportError("no-recipe");
  return { values: recipe.values, photoUrl: recipe.imageUrl };
}

/**
 * The picture at `rawUrl`, if it is a JPEG, PNG or WebP of the size a recipe photo may have. What it is comes from its
 * bytes, not from what the server calls it. It is handed on as it came; saving the recipe re-encodes it like any upload.
 */
export async function importPhoto(rawUrl: string, options: FetchOptions = {}): Promise<{ bytes: Buffer; type: PhotoType }> {
  const { body } = await fetchImage(rawUrl, { allowPrivateAddresses: allowPrivateAddresses(), ...options });
  const type = sniffPhotoType(body);
  if (!type) throw new ImportError("not-image");
  return { bytes: body, type };
}
