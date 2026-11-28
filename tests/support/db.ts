import { prisma } from "@/lib/db";
import { SEEDED_ROWS } from "./seeded-categories";

/**
 * Empty every table, children first, and put the shop sections back as the migration made them: a test may have added,
 * renamed, moved or deleted some, and `GroceryCategory` is the one table that cannot be emptied (every ingredient and grocery
 * entry needs a section, "Other" above all). Runs before each server test.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.groceryEntry.deleteMany(),
    prisma.plannedMeal.deleteMany(),
    prisma.ingredient.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.pantryStaple.deleteMany(),
    prisma.groceryMergeRule.deleteMany(),
    prisma.groceryKeepSeparate.deleteMany(),
    // After the rows that are filed under a section: the foreign keys restrict deleting it.
    prisma.groceryCategory.deleteMany({ where: { id: { notIn: SEEDED_ROWS.map((category) => category.id) } } }),
    ...SEEDED_ROWS.map(({ id, key, name, position }) =>
      prisma.groceryCategory.upsert({ where: { id }, update: { key, name, position }, create: { id, key, name, position } }),
    ),
  ]);
}

/** A form as the browser would post it. Arrays become repeated fields. */
export function formData(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}
