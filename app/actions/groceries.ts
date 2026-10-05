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
 * (weekStart, key) and stores the label to keep the row readable on its own. A hand-added entry carried over
 * from an earlier week (`carried=1`) has no row in this week either: ticking it writes one for this week with
 * the entry's amount, unit and section, so it stays here, ticked, and is not carried on.
 */
export async function toggleGroceryLine(formData: FormData) {
  const weekStart = requireWeekStart(formData);
  const key = readText(formData, "key");
  const label = readText(formData, "label");
  if (!key) throw new Error("toggleGroceryLine: missing `key`");

  const checked = readText(formData, "checked") === "true";
  // The entry's own details travel with the form, since an earlier week's row is the only other place they are.
  const carried =
    readText(formData, "carried") === "1"
      ? {
          label: label || key,
          manual: true,
          dismissed: false,
          quantity: parseQuantity(readText(formData, "quantity")),
          unit: readText(formData, "unit") || null,
          category: parseGroceryCategory(formData.get("category")),
        }
      : {};

  await prisma.groceryEntry.upsert({
    where: { weekStart_key: { weekStart, key } },
    update: { checked, ...carried },
    create: { weekStart, key, label: label || key, checked, ...carried },
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
    // Adding an item that was deleted from this week (and from the weeks after it) brings it back.
    update: { label, quantity, unit, category, manual: true, dismissed: false },
    create: { weekStart, key, label, quantity, unit, category, manual: true },
  });

  revalidatePath("/groceries");
}

/**
 * Delete a hand-added entry. One added in this week is deleted. One carried over from an earlier week
 * (`carried=1`) is deleted from this week on: the earlier weeks keep it, so a row marks it "dismissed"
 * here, which hides it and ends the carrying.
 */
export async function removeGroceryExtra(formData: FormData) {
  if (readText(formData, "carried") === "1") {
    const weekStart = requireWeekStart(formData);
    const key = readText(formData, "key");
    const label = readText(formData, "label");
    if (!key) throw new Error("removeGroceryExtra: missing `key`");
    await prisma.groceryEntry.upsert({
      where: { weekStart_key: { weekStart, key } },
      update: { dismissed: true, manual: true, checked: false },
      create: { weekStart, key, label: label || key, manual: true, dismissed: true },
    });
  } else {
    const id = readText(formData, "id");
    if (!id) throw new Error("removeGroceryExtra: missing `id`");
    await prisma.groceryEntry.delete({ where: { id } });
  }
  revalidatePath("/groceries");
}

/** The grocery page reads rows by their Monday, so any other weekday is moved to it. */
function requireWeekStart(formData: FormData): Date {
  const day = parseDayKey(readText(formData, "weekStart"));
  if (!day) throw new Error("Missing or malformed `weekStart`");
  return startOfWeek(day);
}
