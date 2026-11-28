import { prisma } from "@/lib/db";
import type { CategoryRow } from "@/lib/grocery-category";

/** Every shop section in shop order. Server only: it reads the database. */
export function loadCategories(): Promise<CategoryRow[]> {
  return prisma.groceryCategory.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
}
