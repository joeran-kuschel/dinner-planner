/**
 * Where in the shop an item is found. Safe for client code: it imports no Prisma client.
 *
 * A shop section is a row of the `GroceryCategory` table (`CategoryRow`), in the order of a walk through the shop
 * (`position`). The ten the app starts with (`SEEDED_CATEGORIES`, made by the migration) have a `key` and no `name`:
 * they are named through their translated label until the user names them. A category the user adds has a `name`.
 * `OTHER` is the one items fall back to, so it always exists and stays last.
 */

import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

/** A shop section as the pages and helpers see it. */
export type CategoryRow = { id: string; key: string | null; name: string | null; position: number };

/** The key of the fallback section, where an unknown or deleted category's items go. */
export const OTHER_KEY = "OTHER";

/** The id the migration gives the category with this key (`cat_produce`): the same in every database. */
export const seedCategoryId = (key: string) => `cat_${key.toLowerCase()}`;

/** Limits of the management page: a name is at most this long, and there are at most this many sections. */
export const MAX_CATEGORY_NAME = 40;
export const MAX_CATEGORIES = 30;

/** Why a change to the sections was refused; the page says it in words (`?error=`). */
export const CATEGORY_ERRORS = ["empty", "long", "duplicate", "limit"] as const;
export type CategoryError = (typeof CATEGORY_ERRORS)[number];

/** A typed name as it is stored: trimmed, runs of white space as one space. */
export const normalizeCategoryName = (raw: string): string => raw.trim().replace(/\s+/g, " ");

/** The id of "Other", the section that always exists: a row stored without a section of its own is filed there. */
export const OTHER_CATEGORY_ID = seedCategoryId(OTHER_KEY);

/** The keys of the ten sections the app starts with, in shop order (the migration's own order). */
const SEEDED_KEYS = [
  "PRODUCE",
  "BAKERY",
  "MEAT_FISH",
  "DAIRY_EGGS",
  "PASTA_RICE",
  "PANTRY",
  "HERBS_SPICES",
  "FROZEN",
  "DRINKS",
  OTHER_KEY,
] as const;
type SeededKey = (typeof SEEDED_KEYS)[number];

/** The rows the migration creates; `tests/unit/prisma` checks that the database has exactly these. */
export const SEEDED_CATEGORIES: readonly CategoryRow[] = SEEDED_KEYS.map((key, position) => ({
  id: seedCategoryId(key),
  key,
  name: null,
  position,
}));

const SEEDED_BY_KEY = Object.fromEntries(SEEDED_CATEGORIES.map((category) => [category.key, category])) as Record<SeededKey, CategoryRow>;

/** A seeded category by its key, for code that needs one in particular (the seed data, the tests). */
export function seededCategory(key: SeededKey): CategoryRow {
  return SEEDED_BY_KEY[key];
}

/** The translated name a seeded category has until it is named. */
function defaultLabel(key: SeededKey, i18n: I18n): string {
  switch (key) {
    case "PRODUCE":
      return t(i18n)`Fruit and vegetables`;
    case "BAKERY":
      return t(i18n)`Bakery`;
    case "MEAT_FISH":
      return t(i18n)`Meat and fish`;
    case "DAIRY_EGGS":
      return t(i18n)`Dairy and eggs`;
    case "PASTA_RICE":
      return t(i18n)`Pasta, rice, etc.`;
    case "PANTRY":
      return t(i18n)`Pantry`;
    case "HERBS_SPICES":
      return t(i18n)`Herbs & spices`;
    case "FROZEN":
      return t(i18n)`Frozen`;
    case "DRINKS":
      return t(i18n)`Drinks`;
    case "OTHER":
      return t(i18n)`Other`;
  }
}

/** The category as it is named to people: the user's name for it, else the translated name of a seeded one. */
export function categoryName(category: Pick<CategoryRow, "key" | "name">, i18n: I18n): string {
  if (category.name) return category.name;
  const seeded = SEEDED_KEYS.find((key) => key === category.key);
  return seeded ? defaultLabel(seeded, i18n) : (category.key ?? "");
}

/** The id of the fallback section among `categories` ("Other"). */
export function otherCategoryId(categories: readonly CategoryRow[]): string {
  const other = categories.find((category) => category.key === OTHER_KEY);
  return (other ?? categories[categories.length - 1])?.id ?? OTHER_CATEGORY_ID;
}

/** A posted form value as a category id. Anything unknown, missing or tampered with is "Other". */
export function parseCategoryId(raw: FormDataEntryValue | string | null | undefined, categories: readonly CategoryRow[]): string {
  return categories.find((category) => category.id === raw)?.id ?? otherCategoryId(categories);
}
