/**
 * "On the shelf": what the household has at home, as dated purchases. Safe for client code.
 *
 * Entries are typed in, or made by ticking a pantry staple on the grocery list. Nothing is worked out from the plan,
 * and no amount comes from the grocery list, since more is usually bought than the list asks for.
 */

import type { GroceryCategory } from "@/lib/grocery-category";
import { DEFAULT_GROCERY_CATEGORY, GROCERY_CATEGORIES } from "@/lib/grocery-category";
import { normalizeStaple } from "@/lib/pantry";

/** The longest name and unit, in characters; match the inputs' `maxLength`. */
export const MAX_SHELF_NAME = 80;
export const MAX_SHELF_UNIT = 20;
/** The most entries there can be, so the page stays one a person can look through. */
export const MAX_SHELF_ITEMS = 1000;

/** The name an entry is compared by: the same as a pantry staple's, so "Milk", "milk " and "MILK" are one name. */
export const normalizeShelfName = normalizeStaple;

/** The grocery lines with `onShelf` set on those worked out from the plan whose name has a purchase on the shelf. */
export function markOnShelf<T extends { label: string; manual: boolean }>(
  lines: T[],
  shelfNames: Iterable<string>,
): (T & { onShelf?: boolean })[] {
  const names = new Set(shelfNames);
  return lines.map((line) => (!line.manual && names.has(normalizeShelfName(line.label)) ? { ...line, onShelf: true } : line));
}

export type ShelfEntry = {
  id: string;
  name: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  /** Day key (`YYYY-MM-DD`) of the day it was bought. */
  boughtOn: string;
  /** True when ticking a staple made it. */
  fromList: boolean;
};

/** One name on the shelf: its purchases, newest first, or just the staple when none was noted. */
export type ShelfGroup = {
  name: string;
  label: string;
  category: GroceryCategory;
  staple: { id: string } | null;
  entries: ShelfEntry[];
};

/**
 * The shelf as the page lists it: one group per name (the staples among them, marked as such), the purchases of
 * a name newest first. A group sits in the shop section of its newest purchase, and a staple without one under
 * "Other". Sections come in the grocery list's order, the names in a section alphabetically.
 */
export function groupShelf(
  entries: ShelfEntry[],
  staples: { id: string; name: string }[],
): { category: GroceryCategory; groups: ShelfGroup[] }[] {
  const groups = new Map<string, ShelfGroup>();
  const newestFirst = [...entries].sort((a, b) => b.boughtOn.localeCompare(a.boughtOn) || b.id.localeCompare(a.id));
  for (const entry of newestFirst) {
    const group = groups.get(entry.name);
    if (group) group.entries.push(entry);
    else
      groups.set(entry.name, { name: entry.name, label: entry.label, category: entry.category, staple: null, entries: [entry] });
  }
  for (const staple of staples) {
    const group = groups.get(staple.name);
    if (group) group.staple = { id: staple.id };
    else
      groups.set(staple.name, {
        name: staple.name,
        label: staple.name,
        category: DEFAULT_GROCERY_CATEGORY,
        staple: { id: staple.id },
        entries: [],
      });
  }
  const all = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  return GROCERY_CATEGORIES.map((category) => ({
    category,
    groups: all.filter((group) => group.category === category),
  })).filter((section) => section.groups.length > 0);
}
