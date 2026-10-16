# The shelf

[On the shelf](../ui/shelf.md) is a list of dated purchases, kept in the database. The grocery list stays derived and
stores nothing for it.

## Data

`ShelfItem` (`prisma/schema.prisma`): `label` (as typed), `name` (normalised: `normalizeShelfName` in `lib/shelf.ts`, the same
function as for pantry staples and tags), optional `quantity` and `unit`, `category` (the grocery list's `GroceryCategory`,
default `OTHER`), `boughtOn` (a planner day: UTC midnight, built with `parseDayKey`/`today()` from `lib/week.ts`) and
`createdAt`. The same `name` can occur many times. `sourceWeek` and `sourceKey` are set only on an entry made by ticking a
staple: the grocery line's Monday and key. They are unique together, so one line makes at most one entry, and
`updateShelfItem` leaves them alone. `MAX_SHELF_NAME` is 80, `MAX_SHELF_UNIT` 20, `MAX_SHELF_ITEMS` 1000 (a soft limit, like
the staples').

## Ticking a staple

`toggleGroceryLine` (`app/actions/groceries.ts`) saves the tick as before, then `syncShelf()`: an unticked line deletes the
entry with its `sourceWeek` and `sourceKey`; a ticked line whose normalised name is a `PantryStaple` upserts one (name, label
and section from the line, `boughtOn` today, no amount), and a second tick of the same line changes nothing, so an edit of
the entry survives it. A line that is no staple never touches the shelf. The section travels with every tick as a hidden
field (the grocery list always posts `category`), because a derived line has no stored section of its own.

Tick and entry are written in one transaction. The staple check looks at the line's name only, so a hand-added extra with
a staple's name that is ticked off lands on the shelf too (a staple is something you keep at home, however the line came
to be). The amount is never taken from the grocery list: it is the amount to buy, not what was bought.

## Actions

`app/actions/shelf.ts` (each starts with `requireAccess()`, and refreshes `/shelf` and `/groceries`):

| Action | Does |
| ------ | ---- |
| `addShelfItem` | Stores a purchase. A blank or too long name, an invalid `boughtOn` and (at 1000) further entries are ignored; a day left out means today; an unreadable amount is none; the unit is cut to its limit. |
| `updateShelfItem` | Changes every field of an entry by `id`. An invalid day or a blank name changes nothing; an entry removed in another tab is not an error; a missing `id` throws. |
| `removeShelfItem` | Deletes by `id`; one that is gone already is not an error; a missing `id` throws. |

An entry that cannot be saved is ignored without a message, like a hand-added grocery line: the browser stops the usual
mistakes first (`required`, `maxLength`, the date field), so only a request made by hand or the 1000-entry limit gets
there. The limit is soft (two parallel adds at 999 can pass it, and ticking a staple does not count against it).

Removing a staple is `removePantryStaple` (`app/actions/pantry.ts`), which now refreshes `/shelf` too. Adding or removing a
staple changes the shelf page, which lists staples.

## The page and the note on the list

`groupShelf(entries, staples)` (`lib/shelf.ts`, safe for client code) builds what `app/shelf/page.tsx` shows: one group per
`name` with its purchases newest first, a group in the section of its newest purchase, staples without a purchase under
`OTHER`, sections in the grocery list's order and names alphabetically. `components/shelf-list.tsx` renders it and
`components/shelf-form.tsx` is the one form for adding and editing (a plain form, so it works without JavaScript).

`app/groceries/page.tsx` reads the distinct `name`s on the shelf and sets `onShelf` on every derived line whose normalised
label is one of them; the list shows "On the shelf" on lines that are not ticked, and `aria-describedby` makes a screen
reader read it with the checkbox.
