"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parsePositiveInt, parseQuantity, rawText } from "@/lib/form-data";
import { MAX_SERVINGS } from "@/lib/planner";
import {
  isWebUrl,
  MAX_PREP_MINUTES,
  type RecipeFormState,
  type RecipeFormValues,
} from "@/lib/recipe-form";

/**
 * Ingredient rows arrive as three parallel arrays from the repeated inputs in
 * `RecipeForm`. `FormData.getAll` preserves document order, so index `i` of each
 * array belongs to the same row.
 */
function readValues(formData: FormData): RecipeFormValues {
  const names = formData.getAll("ingredientName").map(rawText);
  const quantities = formData.getAll("ingredientQuantity").map(rawText);
  const units = formData.getAll("ingredientUnit").map(rawText);

  return {
    name: rawText(formData.get("name")),
    description: rawText(formData.get("description")),
    servings: rawText(formData.get("servings")),
    prepMinutes: rawText(formData.get("prepMinutes")),
    sourceUrl: rawText(formData.get("sourceUrl")),
    instructions: rawText(formData.get("instructions")),
    ingredients: names.map((name, index) => ({
      name,
      quantity: quantities[index] ?? "",
      unit: units[index] ?? "",
    })),
  };
}

/**
 * The first problem with the typed values, or `null`. Blank or non-positive
 * numbers are not errors: they fall back to defaults in `toRecipeData`.
 */
function validationError(values: RecipeFormValues): string | null {
  if (!values.name.trim()) return "Give the recipe a name.";
  if ((parsePositiveInt(values.servings) ?? 0) > MAX_SERVINGS) {
    return `A recipe can serve at most ${MAX_SERVINGS} people.`;
  }
  if ((parsePositiveInt(values.prepMinutes) ?? 0) > MAX_PREP_MINUTES) {
    return `Prep time can be at most ${MAX_PREP_MINUTES} minutes.`;
  }
  const sourceUrl = values.sourceUrl.trim();
  if (sourceUrl && !isWebUrl(sourceUrl)) {
    return "The source has to be a web address starting with http:// or https://.";
  }
  return null;
}

function toRecipeData(values: RecipeFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    servings: parsePositiveInt(values.servings) ?? 2,
    prepMinutes: parsePositiveInt(values.prepMinutes),
    sourceUrl: values.sourceUrl.trim() || null,
    instructions: values.instructions.trim() || null,
  };
}

function toIngredientData(values: RecipeFormValues) {
  return values.ingredients.flatMap((row, index) => {
    const name = row.name.trim();
    if (!name) return []; // blank rows are how the UI represents "not filled in yet"

    // An unparseable or non-positive amount becomes "to taste" rather than 0.
    const quantity = parseQuantity(row.quantity);
    return [{ name, quantity, unit: row.unit.trim() || null, position: index }];
  });
}

function reject(prev: RecipeFormState, values: RecipeFormValues, error: string): RecipeFormState {
  return { error, values, attempt: prev.attempt + 1 };
}

export async function createRecipe(
  prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const values = readValues(formData);
  const error = validationError(values);
  if (error) return reject(prev, values, error);

  const recipe = await prisma.recipe.create({
    data: { ...toRecipeData(values), ingredients: { create: toIngredientData(values) } },
  });

  revalidateRecipeViews();
  redirect(`/recipes/${recipe.id}`);
}

export async function updateRecipe(
  prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const id = rawText(formData.get("id")).trim();
  const values = readValues(formData);
  if (!id) return reject(prev, values, "Missing recipe id.");

  const error = validationError(values);
  if (error) return reject(prev, values, error);

  // Ingredient rows have no stable identity in the form, so the whole set is
  // replaced. Cheaper than diffing, and it keeps row order authoritative.
  await prisma.recipe.update({
    where: { id },
    data: {
      ...toRecipeData(values),
      ingredients: { deleteMany: {}, create: toIngredientData(values) },
    },
  });

  revalidateRecipeViews();
  redirect(`/recipes/${id}`);
}

export async function deleteRecipe(formData: FormData) {
  const id = rawText(formData.get("id")).trim();
  if (!id) throw new Error("deleteRecipe: missing `id`");

  await prisma.$transaction([
    // The schema's onDelete: SetNull would leave behind days that name nothing
    // at all — invisible in the week view but still counted as planned. A day
    // that only pointed at this recipe is cleared outright; one with its own
    // title would keep it.
    prisma.plannedMeal.deleteMany({ where: { recipeId: id, customTitle: null } }),
    prisma.recipe.delete({ where: { id } }),
  ]);

  revalidateRecipeViews();
  redirect("/recipes");
}

/** Recipes feed the week view and the grocery list as well as their own pages. */
function revalidateRecipeViews() {
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath("/groceries");
}
