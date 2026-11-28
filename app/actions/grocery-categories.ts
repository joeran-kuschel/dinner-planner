"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access-guard";
import { prisma } from "@/lib/db";
import { readText } from "@/lib/form-data";
import {
  type CategoryError,
  categoryName,
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  normalizeCategoryName,
  OTHER_KEY,
} from "@/lib/grocery-category";
import { isMissingCategory } from "@/lib/grocery-category-server";
import { CATALOGS } from "@/lib/i18n/catalogs";
import { createI18n, LOCALES } from "@/lib/i18n/config";
import { getServerI18n } from "@/lib/i18n/server";

const PAGE = "/groceries/categories";

/** Every view that shows the sections: the list, the page itself, and the recipe forms' selects. */
function revalidateCategories() {
  revalidatePath("/groceries");
  revalidatePath(PAGE);
  revalidatePath("/recipes", "layout");
}

/**
 * Back to the page with the reason in the address, so a form without JavaScript sees it too. The typed name (and the
 * section it was for) come back with it, so a refusal does not make anyone type it again; `n` makes every refusal a new
 * address, so the alert is announced again when the same one comes twice.
 */
function refuse(error: CategoryError, typed?: { id?: string; name: string }): never {
  const query = new URLSearchParams({ error, n: String(Date.now()) });
  if (typed?.id) query.set("id", typed.id);
  if (typed?.name) query.set("name", typed.name);
  redirect(`${PAGE}?${query}`);
}

/**
 * A change that went through. The page is shown again in place, so the client component keeps its state (the focus on the
 * button that moved a section, the announcements): a redirect to the page's own address renders it from scratch. Only when
 * the page shows an error from an earlier refusal (its forms then post `clear=1`) it is redirected to the bare address, so the
 * alert does not outlive the change.
 */
function done(formData: FormData): void {
  revalidateCategories();
  if (readText(formData, "clear") === "1") redirect(PAGE);
}

/** The sections in shop order, as the database has them. */
const ordered = (tx: Pick<typeof prisma, "groceryCategory">) =>
  tx.groceryCategory.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });

/** Positions 0, 1, 2 … in the order given, writing only what changed (this also heals any ties). */
async function renumber(tx: Pick<typeof prisma, "groceryCategory">, ids: string[], current: Map<string, number>) {
  for (const [position, id] of ids.entries()) {
    if (current.get(id) !== position) await tx.groceryCategory.update({ where: { id }, data: { position } });
  }
}

/**
 * Whether `name` is free: no other section is shown under it, in the page's language (a seeded section is shown
 * under its translated name until it is named, so "Bakery" cannot be added next to it).
 */
async function nameIsTaken(name: string, exceptId: string | null): Promise<boolean> {
  const wanted = name.toLowerCase();
  // In every language: "Bakery" is taken while the starting section can be shown as "Bakery", also on a page in German.
  const languages = LOCALES.map((locale) => createI18n(locale, CATALOGS[locale]));
  return (await ordered(prisma)).some(
    (row) => row.id !== exceptId && languages.some((i18n) => categoryName(row, i18n).toLowerCase() === wanted),
  );
}

/** Run a transaction that a concurrent save can make the foreign key refuse (a row filed under the section about to go): once more. */
async function retryOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingCategory(error)) return run();
    throw error;
  }
}

/** Add a section just before "Other", which stays last. */
export async function addGroceryCategory(formData: FormData) {
  await requireAccess();
  const name = normalizeCategoryName(readText(formData, "name"));
  if (!name) refuse("empty");
  if (name.length > MAX_CATEGORY_NAME) refuse("long", { name: name.slice(0, MAX_CATEGORY_NAME + 1) });
  if (await nameIsTaken(name, null)) refuse("duplicate", { name });

  const refused = await prisma.$transaction(async (tx) => {
    const rows = await ordered(tx);
    if (rows.length >= MAX_CATEGORIES) return "limit" as const;
    const other = rows.find((row) => row.key === OTHER_KEY);
    const created = await tx.groceryCategory.create({ data: { name, position: other ? other.position : rows.length } });
    const order = rows.map((row) => row.id);
    order.splice(other ? order.indexOf(other.id) : order.length, 0, created.id);
    await renumber(tx, order, new Map([...rows.map((row) => [row.id, row.position] as const), [created.id, created.position]]));
    return null;
  });
  if (refused) refuse(refused, { name });
  done(formData);
}

/**
 * Rename a section. A seeded one saved with an empty name goes back to its translated name; a section the user added
 * must have a name. Saving a seeded section under the name it is shown by keeps it translated.
 */
export async function renameGroceryCategory(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  if (!id) throw new Error("renameGroceryCategory: missing `id`");
  const row = await prisma.groceryCategory.findUnique({ where: { id } });
  if (!row) return done(formData); // deleted in another tab: the page is shown again without it

  const name = normalizeCategoryName(readText(formData, "name"));
  if (!name) {
    if (row.key === null) refuse("empty", { id, name });
    await prisma.groceryCategory.update({ where: { id }, data: { name: null } });
    return done(formData);
  }
  if (name.length > MAX_CATEGORY_NAME) refuse("long", { id, name: name.slice(0, MAX_CATEGORY_NAME + 1) });
  const { i18n } = await getServerI18n();
  if (row.name === null && name === categoryName(row, i18n)) return done(formData);
  if (await nameIsTaken(name, id)) refuse("duplicate", { id, name });

  await prisma.groceryCategory.update({ where: { id }, data: { name } });
  done(formData);
}

/** Move a section one place up or down. "Other" does not move, and nothing moves past it. */
export async function moveGroceryCategory(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  const direction = readText(formData, "direction");
  if (!id || (direction !== "up" && direction !== "down")) throw new Error("moveGroceryCategory: missing `id` or `direction`");

  await prisma.$transaction(async (tx) => {
    const rows = await ordered(tx);
    const from = rows.findIndex((row) => row.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= rows.length) return;
    if (rows[from].key === OTHER_KEY || rows[to].key === OTHER_KEY) return;

    const order = rows.map((row) => row.id);
    [order[from], order[to]] = [order[to], order[from]];
    // Every position is written from the new order: a tie in the old one cannot survive a move.
    await renumber(tx, order, new Map());
  });
  done(formData);
}

/** Delete a section: what was filed under it (ingredients and list entries) moves to "Other" in the same step. */
export async function deleteGroceryCategory(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  if (!id) throw new Error("deleteGroceryCategory: missing `id`");

  await retryOnce(() =>
    prisma.$transaction(async (tx) => {
      const rows = await ordered(tx);
      const row = rows.find((candidate) => candidate.id === id);
      const other = rows.find((candidate) => candidate.key === OTHER_KEY);
      if (!row || !other || row.id === other.id) return; // gone already, or "Other", which always stays

      await tx.ingredient.updateMany({ where: { categoryId: id }, data: { categoryId: other.id } });
      await tx.groceryEntry.updateMany({ where: { categoryId: id }, data: { categoryId: other.id } });
      await tx.groceryCategory.delete({ where: { id } });
      await renumber(
        tx,
        rows.filter((candidate) => candidate.id !== id).map((candidate) => candidate.id),
        new Map(),
      );
    }),
  );
  done(formData);
}
