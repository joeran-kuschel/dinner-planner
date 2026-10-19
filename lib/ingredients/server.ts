/**
 * The user's merge rules, read from the database. Server only.
 */

import { prisma } from "@/lib/db";
import type { MergeRule } from "@/lib/ingredients/canonical";

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
