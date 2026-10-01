import { prisma } from "@/lib/db";

/** Empty every table, children first. Runs before each server test. */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.groceryEntry.deleteMany(),
    prisma.plannedMeal.deleteMany(),
    prisma.ingredient.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.pantryStaple.deleteMany(),
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
