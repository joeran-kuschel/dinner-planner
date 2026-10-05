# Grocery list: carrying hand-added entries over

A hand-added grocery entry that is still unticked at the end of its week appears on the next week's list, and keeps
moving until it is ticked ([Grocery list](../ui/groceries.md)). Like the rest of the list this is derived, never stored:
`carriedEntries(rows, weekStart)` in `lib/grocery-carry.ts` (pure, safe for client code) works it out whenever the page
renders, from the rows of the earlier weeks. No job runs at the end of a week, so a week the app was never opened in
loses nothing.

## The rule

The page reads the earlier rows with `carryRowsWhere(weekStart)`: every row before the shown week that is hand-added
(`manual`) or ticked. Per item (the `key`, name and unit) they are read oldest first:

- an unticked hand-added row starts the carrying, or continues it;
- a **ticked** row (even one of a line from the plan: the item was bought) or a **dismissed** row ends it;
- weeks with no row change nothing.

An item still carrying when it reaches the shown week is carried into it, with the amount, unit and section of its
latest unticked row and `weeksAgo`, the age from the week the carrying began. Rows of the shown week or later are
never read, so earlier weeks are shown as they were and an entry only moves forward.

## What the week page does with it

`app/groceries/page.tsx` lists a carried entry as a hand-added line with `carriedWeeks` set, unless the week already
has a row of its own for the key (then that row is the line, still marked) or a line from the plan with the same key
(shown as one line, as for any hand-added extra). A row that is `dismissed` is never listed.

## Ticking and deleting a carried line

A carried line has no row in the shown week. The row's form posts `carried=1` with the entry's `quantity`, `unit` and
`category`:

- `toggleGroceryLine` then upserts a hand-added row for the week with those details and the new tick state. So the line
  stays in the week it was ticked in, ticked, and the next week's rule sees the tick and stops.
- `removeGroceryExtra` with `carried=1` (and `weekStart`, `key`, `label`) upserts a row with `dismissed = true`, unticked:
  hidden from this week on, no longer carried. The earlier rows are untouched. Deleting an entry in the week it was
  added still deletes its row by `id`, as before.
- `addGroceryExtra` sets `dismissed` back to false, so adding the same item again in that week starts over.

## Data

`GroceryEntry.dismissed` (migration `grocery_entry_dismissed`, default false) is the only addition. Nothing is stored for
the weeks an entry is carried through.

## Tests

- `tests/unit/lib/grocery-carry.test.ts`: the rule (chains, skipped weeks, ticked, dismissed, added again, ordering).
- `tests/unit/app/actions/groceries.test.ts`: ticking, deleting and adding again.
- `tests/unit/components/grocery-list.test.tsx`: the mark, what a tick and a delete post, German.
- `tests/e2e/groceries.spec.ts` ("hand-added entries carried over"): add, carry, tick, delete, skipped weeks.
