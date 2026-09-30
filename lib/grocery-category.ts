/**
 * Where in the shop an item is found. Safe for client code: it imports only the
 * generated enum constants, never the Prisma client.
 *
 * The order of `GROCERY_CATEGORIES` is the order of the groups on the grocery
 * list (a walk through the shop), and mirrors the enum in `prisma/schema.prisma`.
 */

import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { GroceryCategory } from "@/generated/prisma/enums";

export { GroceryCategory };

export const GROCERY_CATEGORIES: readonly GroceryCategory[] = Object.values(GroceryCategory);

export const DEFAULT_GROCERY_CATEGORY: GroceryCategory = GroceryCategory.OTHER;

/** The category as it is named to people. */
export function categoryLabel(category: GroceryCategory, i18n: I18n): string {
  switch (category) {
    case GroceryCategory.PRODUCE:
      return t(i18n)`Fruit and vegetables`;
    case GroceryCategory.BAKERY:
      return t(i18n)`Bakery`;
    case GroceryCategory.MEAT_FISH:
      return t(i18n)`Meat and fish`;
    case GroceryCategory.DAIRY_EGGS:
      return t(i18n)`Dairy and eggs`;
    case GroceryCategory.PANTRY:
      return t(i18n)`Pantry`;
    case GroceryCategory.FROZEN:
      return t(i18n)`Frozen`;
    case GroceryCategory.DRINKS:
      return t(i18n)`Drinks`;
    case GroceryCategory.OTHER:
      return t(i18n)`Other`;
  }
}

/** A posted form value as a category. Anything unknown, missing or tampered with is "Other". */
export function parseGroceryCategory(raw: FormDataEntryValue | string | null | undefined): GroceryCategory {
  return GROCERY_CATEGORIES.find((category) => category === raw) ?? DEFAULT_GROCERY_CATEGORY;
}
