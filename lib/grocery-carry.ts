/**
 * Hand-added grocery entries that are still unticked at the end of their week carry over to the next week,
 * and keep moving until they are ticked. Worked out whenever the list is rendered from the rows of the earlier
 * weeks, so nothing is stored for a week that was never opened and no job has to run on time. The list stays
 * derived: a carried line has no row in the week it is carried to until it is ticked or deleted there.
 *
 * Safe for client code (it imports no Prisma client).
 */

import type { GroceryCategory } from "@/lib/grocery-category";

/** The part of a `GroceryEntry` row the rule reads. */
export type CarryRow = {
  weekStart: Date;
  key: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  manual: boolean;
  checked: boolean;
  dismissed: boolean;
};

/** An entry carried into the week being shown, and how many weeks ago it was added. */
export type CarriedEntry = Pick<CarryRow, "key" | "label" | "quantity" | "unit" | "category"> & { weeksAgo: number };

const WEEK_MS = 7 * 86_400_000;

/**
 * The entries carried into the week that starts on `weekStart`, from the rows of the weeks before it
 * (`weekStart` of a row is its Monday). Per item (name and unit) the rows are read oldest first: a hand-added
 * row that is unticked starts or continues the carrying, a ticked or deleted ("dismissed") row ends it, and
 * weeks without a row change nothing, so skipped weeks lose nothing. Rows of the shown week or later are
 * ignored, so an earlier week never shows what was carried into it from later on. A tick on a line that
 * is not a hand-added entry also ends it: the item was bought. The amount, unit and section come from
 * the latest unticked row.
 */
export function carriedEntries(rows: readonly CarryRow[], weekStart: Date): CarriedEntry[] {
  const earlier = rows.filter((row) => row.weekStart < weekStart).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  const carrying = new Map<string, { since: Date; row: CarryRow }>();
  for (const row of earlier) {
    if (row.checked || row.dismissed) carrying.delete(row.key);
    else if (row.manual) carrying.set(row.key, { since: carrying.get(row.key)?.since ?? row.weekStart, row });
  }
  return [...carrying.values()].map(({ since, row }) => ({
    key: row.key,
    label: row.label,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    weeksAgo: Math.round((weekStart.getTime() - since.getTime()) / WEEK_MS),
  }));
}

/**
 * The earlier weeks' rows that matter: hand-added ones and ticked ones (a tick ends the carrying). Every
 * ticked row of the earlier weeks is read, derived lines' ticks included; for one household that is a few
 * dozen rows a week, so it is left as one simple query.
 */
export const carryRowsWhere = (weekStart: Date) => ({
  weekStart: { lt: weekStart },
  OR: [{ manual: true }, { checked: true }],
});
