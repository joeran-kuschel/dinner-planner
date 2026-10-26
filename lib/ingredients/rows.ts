/**
 * Stored grocery rows seen through the canonical keys. Safe for client code.
 *
 * A row keeps the key it was written with, so rows from before the dictionary and the merge rules, and rows of
 * names that were merged since, no longer match the keys of the lines on the page. They are matched by their
 * canonical key instead, and nothing stored is changed.
 */

import type { Canonicaliser } from "@/lib/ingredients/canonical";

/**
 * The rows of one week under their canonical keys. Rows that now share a key are read as one line:
 * - what the line is (name, amount, unit, section, and whether it is a hand-added entry) comes from the first
 *   live hand-added row, else the row written with exactly that key, else the first row. So a hand-added entry
 *   stored under an old key stays an entry when a tick is written under the canonical key;
 * - whether it is ticked comes from the row written with exactly that key (the latest word on it), and without
 *   one the line counts as ticked only when every part of it was;
 * - it is deleted ("dismissed") when the row written with exactly that key is, else when its details row is.
 * Two hand-added rows that come to share a key are one line with the first row's amount: the amounts of rows
 * written before a merge are not added up.
 */
export function canonicalRows<T extends { key: string; checked: boolean; manual: boolean; dismissed: boolean }>(
  rows: readonly T[],
  canon: Canonicaliser,
): T[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = canon.keyOfStored(row.key);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return [...byKey].map(([key, group]) => {
    const exact = group.find((row) => row.key === key);
    const details = group.find((row) => row.manual && !row.dismissed) ?? exact ?? group[0];
    return {
      ...details,
      key,
      checked: exact ? exact.checked : group.every((row) => row.checked),
      dismissed: exact ? exact.dismissed : details.dismissed,
    };
  });
}

/** Rows of other weeks under their canonical keys; each keeps its own, as the carrying reads them one by one. */
export function withCanonicalKeys<T extends { key: string }>(rows: readonly T[], canon: Canonicaliser): T[] {
  return rows.map((row) => ({ ...row, key: canon.keyOfStored(row.key) }));
}

/**
 * Every ingredient name that is really on the grocery page of a week: what its planned recipes need, and the hand-added
 * entries that are on the list (this week's that are not deleted, and the earlier weeks' that are still carried:
 * written by hand, not deleted, not ticked). A plural folds into its singular only when the singular is among them
 * (`createCanonicaliser({ names })`); an entry that is gone from the list does not count.
 */
export function pageNames(input: {
  meals: readonly { recipe: { ingredients: readonly { name: string }[] } | null }[];
  entries: readonly { label: string; manual: boolean; dismissed: boolean }[];
  earlierEntries: readonly { label: string; manual: boolean; dismissed: boolean; checked: boolean }[];
}): string[] {
  return [
    ...input.meals.flatMap((meal) => meal.recipe?.ingredients.map((ingredient) => ingredient.name) ?? []),
    ...input.entries.filter((entry) => entry.manual && !entry.dismissed).map((entry) => entry.label),
    ...input.earlierEntries.filter((entry) => entry.manual && !entry.dismissed && !entry.checked).map((entry) => entry.label),
  ];
}
