import { prisma } from "@/lib/db";
import type { CategoryRow } from "@/lib/grocery-category";

/** Every shop section in shop order. Server only: it reads the database. */
export function loadCategories(): Promise<CategoryRow[]> {
  return prisma.groceryCategory.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
}

/** Postgres refused a row because the category it names is gone (Prisma's P2003). */
export const isMissingCategory = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2003";

/**
 * Run a write that files rows under the shop sections, with the sections as they are now. A category deleted between
 * reading them and the write makes Postgres refuse the row (a foreign key): the write is tried once more with the
 * sections read again, where the deleted id is unknown and so becomes "Other", rather than failing the save.
 */
export async function withCategories<T>(write: (categories: CategoryRow[]) => Promise<T>): Promise<T> {
  try {
    return await write(await loadCategories());
  } catch (error) {
    if (isMissingCategory(error)) return write(await loadCategories());
    throw error;
  }
}
