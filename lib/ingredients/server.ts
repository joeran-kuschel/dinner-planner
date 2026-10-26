/**
 * The user's merge rules, read from the database. Server only.
 */

import { prisma } from "@/lib/db";
import { carryRowsWhere } from "@/lib/grocery-carry";
import type { MergeRule } from "@/lib/ingredients/canonical";
import { pageNames } from "@/lib/ingredients/rows";
import { addDays } from "@/lib/week";

/** A stored rule: what the canonicaliser needs, and the id to undo it by. */
export type StoredMergeRule = MergeRule & { id: string };

/** Every merge rule, oldest first. A household has a handful; they are read whole on every grocery page. */
export async function loadMergeRules(): Promise<StoredMergeRule[]> {
  const rows = await prisma.groceryMergeRule.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    from: row.fromName,
    to: row.toName,
    fromLabel: row.fromLabel,
    toLabel: row.toLabel,
  }));
}

/** A name the user keeps on a line of its own, and the id to undo it by. */
export type StoredKeepSeparate = { id: string; name: string; label: string };

/** Every name kept separate, oldest first. */
export async function loadKeepSeparate(): Promise<StoredKeepSeparate[]> {
  const rows = await prisma.groceryKeepSeparate.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(({ id, name, label }) => ({ id, name, label }));
}

/** The names `pageNames` finds for the week of `weekStart`, read from the database: what a server action needs to key an entry like the page does. */
export async function loadPageNames(weekStart: Date): Promise<string[]> {
  const [meals, entries, earlierEntries] = await Promise.all([
    prisma.plannedMeal.findMany({
      where: { date: { gte: weekStart, lt: addDays(weekStart, 7) } },
      select: { recipe: { select: { ingredients: { select: { name: true } } } } },
    }),
    prisma.groceryEntry.findMany({ where: { weekStart }, select: { label: true, manual: true, dismissed: true } }),
    prisma.groceryEntry.findMany({
      where: carryRowsWhere(weekStart),
      select: { label: true, manual: true, dismissed: true, checked: true },
    }),
  ]);
  return pageNames({ meals, entries, earlierEntries });
}
