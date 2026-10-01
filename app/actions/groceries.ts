"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseQuantity, readText } from "@/lib/form-data";
import { groceryKey } from "@/lib/grocery";
import { parseGroceryCategory } from "@/lib/grocery-category";
import { parseDayKey, startOfWeek } from "@/lib/week";

/**
 * Tick or untick a line.
 *
 * Derived lines have no row until they are first ticked, so this upserts by
 * (weekStart, key) and stores the label to keep the row readable on its own.
 */
export async function toggleGroceryLine(formData: FormData) {
  const weekStart = requireWeekStart(formData);
  const key = readText(formData, "key");
  const label = readText(formData, "label");
  if (!key) throw new Error("toggleGroceryLine: missing `key`");

  const checked = readText(formData, "checked") === "true";

  await prisma.groceryEntry.upsert({
    where: { weekStart_key: { weekStart, key } },
    update: { checked },
    create: { weekStart, key, label: label || key, checked },
  });

  revalidatePath("/groceries");
}

/** Add something the recipes do not cover — dish soap, wine, bin bags. */
export async function addGroceryExtra(formData: FormData) {
  const weekStart = requireWeekStart(formData);
  const label = readText(formData, "label");
  if (!label) return;

  const unit = readText(formData, "unit") || null;
  const quantity = parseQuantity(readText(formData, "quantity"));

  const category = parseGroceryCategory(formData.get("category"));
  const key = groceryKey(label, unit);

  // Adding the same extra twice updates the amount instead of erroring on the
  // (weekStart, key) unique constraint.
  await prisma.groceryEntry.upsert({
    where: { weekStart_key: { weekStart, key } },
    update: { label, quantity, unit, category, manual: true },
    create: { weekStart, key, label, quantity, unit, category, manual: true },
  });

  revalidatePath("/groceries");
}

export async function removeGroceryExtra(formData: FormData) {
  const id = readText(formData, "id");
  if (!id) throw new Error("removeGroceryExtra: missing `id`");

  await prisma.groceryEntry.delete({ where: { id } });
  revalidatePath("/groceries");
}

/** The grocery page reads rows by their Monday, so any other weekday is moved to it. */
function requireWeekStart(formData: FormData): Date {
  const day = parseDayKey(readText(formData, "weekStart"));
  if (!day) throw new Error("Missing or malformed `weekStart`");
  return startOfWeek(day);
}
