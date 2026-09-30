"use server";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parsePositiveInt, parseQuantity, rawText } from "@/lib/form-data";
import { MAX_TAG_LENGTH, MAX_TAGS, parseTags, tagsWithinLimits } from "@/lib/tags";
import { parseGroceryCategory } from "@/lib/grocery-category";
import { MAX_SERVINGS } from "@/lib/planner";
import { processPhoto, type ProcessedPhoto } from "@/lib/recipe-photo";
import { MAX_PHOTO_ALT_LENGTH } from "@/lib/recipe-photo-shared";
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
  const categories = formData.getAll("ingredientCategory").map(rawText);

  return {
    name: rawText(formData.get("name")),
    description: rawText(formData.get("description")),
    servings: rawText(formData.get("servings")),
    prepMinutes: rawText(formData.get("prepMinutes")),
    sourceUrl: rawText(formData.get("sourceUrl")),
    instructions: rawText(formData.get("instructions")),
    photoAlt: rawText(formData.get("photoAlt")),
    tags: parseTags(formData.getAll("tag").map(rawText), rawText(formData.get("tags"))),
    ingredients: names.map((name, index) => ({
      name,
      quantity: quantities[index] ?? "",
      unit: units[index] ?? "",
      category: parseGroceryCategory(categories[index]),
    })),
  };
}

/**
 * The first problem with the typed values, or `null`. Blank or non-positive
 * numbers are not errors: they fall back to defaults in `toRecipeData`.
 */
function validationError(values: RecipeFormValues): MessageDescriptor | null {
  if (!values.name.trim()) return msg`Give the recipe a name.`;
  if ((parsePositiveInt(values.servings) ?? 0) > MAX_SERVINGS) {
    return msg`A recipe can serve at most ${MAX_SERVINGS} people.`;
  }
  if ((parsePositiveInt(values.prepMinutes) ?? 0) > MAX_PREP_MINUTES) {
    return msg`Prep time can be at most ${MAX_PREP_MINUTES} minutes.`;
  }
  if (values.tags.length > MAX_TAGS) return msg`A recipe can have at most ${MAX_TAGS} tags.`;
  if (!tagsWithinLimits(values.tags)) return msg`A tag can be at most ${MAX_TAG_LENGTH} characters.`;
  const sourceUrl = values.sourceUrl.trim();
  if (sourceUrl && !isWebUrl(sourceUrl)) {
    return msg`The source has to be a web address starting with http:// or https://.`;
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

/** Tags are shared between recipes, so each one is connected if it exists and created if not. */
function toTagData(values: RecipeFormValues) {
  return values.tags.map((name) => ({ where: { name }, create: { name } }));
}

/**
 * Two saves adding the same new tag at once both find it missing, and the second insert breaks the
 * unique name. By then the tag exists, so the same save goes through the second time.
 */
async function retryOnTagRace<T>(save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return save();
    throw error;
  }
}

/** Tags no recipe uses any more, so the filter and the suggestions list only what is in use. */
const pruneTags = () => prisma.tag.deleteMany({ where: { recipes: { none: {} } } });

function toIngredientData(values: RecipeFormValues) {
  return values.ingredients.flatMap((row, index) => {
    const name = row.name.trim();
    if (!name) return []; // blank rows are how the UI represents "not filled in yet"

    // An unparseable or non-positive amount becomes "to taste" rather than 0.
    const quantity = parseQuantity(row.quantity);
    return [
      {
        name,
        quantity,
        unit: row.unit.trim() || null,
        category: parseGroceryCategory(row.category),
        position: index,
      },
    ];
  });
}

/** The photo file the form posted, if one was chosen (an untouched file field posts an empty one). */
function uploadedPhoto(formData: FormData): File | null {
  const upload = formData.get("photo");
  return upload instanceof File && upload.size > 0 ? upload : null;
}

function reject(prev: RecipeFormState, values: RecipeFormValues, error: MessageDescriptor): RecipeFormState {
  return { error, values, attempt: prev.attempt + 1 };
}

/** What the form asks to happen to the recipe's photo. */
type PhotoChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "describe"; alt: string }
  | { kind: "set"; photo: ProcessedPhoto; alt: string };

/**
 * Read the photo part of the form. `existing` is the photo the recipe has now, if
 * any. A new file replaces it (and wins over "Remove photo"); without one, the
 * photo can be removed or only described again. Every photo needs its description.
 */
async function readPhotoChange(
  formData: FormData,
  values: RecipeFormValues,
  existing: { alt: string } | null,
): Promise<PhotoChange | { error: MessageDescriptor }> {
  const file = uploadedPhoto(formData);
  const alt = values.photoAlt.trim();

  if (!file && !existing) return { kind: "keep" };
  if (!file && existing && formData.get("removePhoto") === "1") return { kind: "remove" };

  if (!alt) return { error: msg`Describe the photo in a few words, for people who cannot see it.` };
  if (alt.length > MAX_PHOTO_ALT_LENGTH) {
    return { error: msg`The description of the photo can be at most ${MAX_PHOTO_ALT_LENGTH} characters.` };
  }
  if (!file) return alt === existing?.alt ? { kind: "keep" } : { kind: "describe", alt };

  const result = await processPhoto(file);
  return "error" in result ? result : { kind: "set", photo: result.photo, alt };
}

/** The photo row for a processed upload; Prisma wants plain byte arrays. */
function toPhotoData({ photo, alt }: { photo: ProcessedPhoto; alt: string }) {
  return {
    full: new Uint8Array(photo.full),
    fullWidth: photo.fullWidth,
    fullHeight: photo.fullHeight,
    thumb: new Uint8Array(photo.thumb),
    alt,
  };
}

export async function createRecipe(
  prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const values = readValues(formData);
  const error = validationError(values);
  if (error) return reject(prev, values, error);

  const change = await readPhotoChange(formData, values, null);
  if ("error" in change) return reject(prev, values, change.error);

  const recipe = await retryOnTagRace(() =>
    prisma.recipe.create({
      data: {
        ...toRecipeData(values),
        ingredients: { create: toIngredientData(values) },
        tags: { connectOrCreate: toTagData(values) },
        ...(change.kind === "set" ? { photo: { create: toPhotoData(change) } } : {}),
      },
    }),
  );

  revalidateRecipeViews();
  redirect(`/recipes/${recipe.id}`);
}

export async function updateRecipe(
  prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const id = rawText(formData.get("id")).trim();
  const values = readValues(formData);
  if (!id) return reject(prev, values, msg`Missing recipe id.`);

  const error = validationError(values);
  if (error) return reject(prev, values, error);

  const existing = await prisma.recipePhoto.findUnique({ where: { recipeId: id }, select: { alt: true } });
  const change = await readPhotoChange(formData, values, existing);
  if ("error" in change) return reject(prev, values, change.error);

  // Ingredient rows have no stable identity in the form, so the whole set is
  // replaced. Cheaper than diffing, and it keeps row order authoritative.
  await retryOnTagRace(() =>
    prisma.$transaction([
      prisma.recipe.update({
        where: { id },
        data: {
          ...toRecipeData(values),
          ingredients: { deleteMany: {}, create: toIngredientData(values) },
          tags: { set: [], connectOrCreate: toTagData(values) },
          ...photoUpdate(change),
        },
      }),
      pruneTags(),
    ]),
  );

  revalidateRecipeViews();
  redirect(`/recipes/${id}`);
}

/** The nested write for the recipe's photo row; nothing when the photo stays as it is. */
function photoUpdate(change: PhotoChange) {
  switch (change.kind) {
    case "set": {
      const data = toPhotoData(change);
      return { photo: { upsert: { create: data, update: data } } };
    }
    case "describe":
      return { photo: { update: { alt: change.alt } } };
    case "remove":
      return { photo: { delete: true } };
    case "keep":
      return {};
  }
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
    pruneTags(),
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
