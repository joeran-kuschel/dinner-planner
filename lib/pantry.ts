/**
 * Pantry staples: ingredients the household always has, which are left off the grocery list.
 * Safe for client code.
 *
 * The list stays derived: nothing about a grocery line is stored differently. A staple only
 * decides, when the page is built, which derived lines are shown.
 */

import { normalizeTag } from "@/lib/tags";

/** The longest staple name, in characters; matches the input's `maxLength`. */
export const MAX_STAPLE_LENGTH = 60;
/** The most staples there can be, so the list stays one a person can look through. */
export const MAX_STAPLES = 200;

/**
 * A staple as it is stored and compared: trimmed, inner whitespace collapsed, lowercase. The same
 * normalisation as a tag, so "Salt", "salt " and "SALT" are one staple.
 */
export const normalizeStaple = normalizeTag;

/**
 * Split grocery lines into those to shop for and those hidden by a staple. A line is hidden when its
 * name, normalised, is a staple; the unit does not matter ("1 tsp salt" and "salt" are both salt),
 * but a part of a name does not count ("oil" does not hide "olive oil"). Lines added by hand are never
 * hidden: they were put there on purpose. That includes a derived line that a line added by hand
 * shares its name and unit with (`handAdded`), which the page shows as one line. Both lists keep the
 * order they came in.
 */
export function splitStaples<T extends { label: string; manual: boolean; handAdded?: boolean }>(
  lines: T[],
  staples: Iterable<string>,
): { shown: T[]; hidden: T[] } {
  const names = new Set(staples);
  const shown: T[] = [];
  const hidden: T[] = [];
  for (const line of lines) {
    (!line.manual && !line.handAdded && names.has(normalizeStaple(line.label)) ? hidden : shown).push(line);
  }
  return { shown, hidden };
}

/**
 * What the grocery page lists, given the staples: the lines to shop for, or (`showHidden`) all of them
 * with the ones a staple would hide marked `pantry`. `hiddenCount` is how many lines the staples hide
 * either way, and `allInPantry` is true when the list is empty only because of them.
 */
export function applyStaples<T extends { label: string; manual: boolean; handAdded?: boolean }>(
  lines: T[],
  staples: Iterable<string>,
  showHidden: boolean,
): { lines: (T & { pantry?: boolean })[]; hiddenCount: number; allInPantry: boolean } {
  const { shown, hidden } = splitStaples(lines, staples);
  const hiddenSet = new Set<T>(hidden);
  return {
    lines: showHidden ? lines.map((line) => (hiddenSet.has(line) ? { ...line, pantry: true } : line)) : shown,
    hiddenCount: hidden.length,
    allInPantry: shown.length === 0 && hidden.length > 0,
  };
}
