# Pantry staples

Ingredients the household always has are kept off the grocery list ([Grocery list](../ui/groceries.md)). The list stays
derived: a staple decides which derived lines are shown when the page is built and changes nothing that is stored for a
line.

## Data

`PantryStaple` (`prisma/schema.prisma`) has an `id` and a unique `name`. It is global, not per week. Names are stored
normalised (`normalizeStaple` in `lib/pantry.ts`, the same function as for tags: trimmed, inner whitespace collapsed,
lowercase), so the case-sensitive unique index means one staple per name. `MAX_STAPLE_LENGTH` is 60 and `MAX_STAPLES` is 200.

## Matching

`splitStaples(lines, staples)` in `lib/pantry.ts` (safe for client code) returns the lines to show and the hidden ones:

- A line is hidden when its label, normalised, is a staple. The unit is not part of the comparison, so every "salt" line is
  hidden whatever its unit, and a line is never hidden by a part of its name.
- Lines with `manual: true` (added by hand) are never hidden, nor is a derived line with `handAdded: true`: the page shows a
  hand-added line and a derived line with the same key (name and unit) as one derived line, and sets `handAdded` from the
  stored entry's `manual` flag, so the hand-added Salt does not disappear with the planned one.
- Both lists keep the order they came in.

`applyStaples(lines, staples, showHidden)` is what the page calls: it returns the lines to list (the shown ones, or all of
them with `pantry: true` on the hidden ones), `hiddenCount` and `allInPantry`. It is pure and unit-tested.
`app/groceries/page.tsx` builds the derived lines and the extras exactly as before, then splits them. Hiding is after the
aggregation, so amounts, categories and tick state are untouched, and a hidden line's `GroceryEntry` row, if it has one,
stays where it is. With `?pantry=show` the hidden lines are put back into the list with `pantry: true`, which the list marks
"in the pantry". The page passes `allInPantry` to the list when nothing is shown only because staples hide it all.

## Actions

`app/actions/pantry.ts`:

| Action | Does |
| ------ | ---- |
| `addPantryStaple` | Normalises `name`; ignores blank names, names over the limit and (at 200 staples) new names; upserts, so adding one again changes nothing. The browser stops these before: the field has `maxLength`, and at the limit the section switches the field off and says so, so the silent refusal only meets requests made by hand. The count check and the upsert are two statements, so parallel adds at 199 can pass 200 by a little; the limit is soft. |
| `removePantryStaple` | Deletes by `id`. An id that is gone already (removed in another tab) is not an error; a missing `id` throws. |

Both call `revalidatePath("/groceries")`. The name is read with `readText`, which drops NUL characters.

## The section

`components/pantry-section.tsx` is a `<details>` with plain forms, so it works without JavaScript. It is `open` while the
hidden lines are shown, and keeps its own open state otherwise (a server action's refresh does not close it). The add field's
`<datalist>` is the distinct ingredient names of all recipes, normalised, without the staples already chosen.
