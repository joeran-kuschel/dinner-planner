# Grocery list: copy and print

How the grocery page ([UI chapter](../ui/groceries.md)) is copied as text and printed. Neither stores anything and
neither needs a server action or an API route.

## The text

`groceryListText({ weekRange, lines }, i18n)` in `lib/grocery.ts` is a pure function: the title and the week, a blank
line, then each non-empty shop section (`groupByCategory()`, so in shop order) as its translated name and one `- ` line
per item, sections separated by a blank line. An item is `<amount> <name>` with the amount from `formatQuantity()`
(the language's decimal separator, no thousands separator), `<name> (to taste)` for a line from recipes without a total,
and just `<name>` for a hand-added line with neither amount nor unit.

It skips ticked lines and lines flagged `pantry` (the lines a pantry staple would hide, which the page includes only
when the visitor chose to show them). It returns `""` when nothing is left. It takes the i18n instance like every text
helper (see [i18n](i18n.md)).

`app/groceries/page.tsx` builds the text on the server from the same `lines` the list shows and passes it to the client
component `components/grocery-share.tsx` as a string (`null` for `""`), so the copy always matches what was rendered and
the client needs no copy of the grouping logic.

## The buttons

`GroceryShare` calls `navigator.clipboard.writeText()` on click. It is feature-checked at click time, not while
rendering, so the server and the first client render agree. Three outcomes drive one `role="status"` line and the
fallback: copied ("Copied"), refused (the promise rejects: "Couldn't copy…" plus a read-only `<textarea>` with the text)
and unavailable (no `navigator.clipboard`, as on plain http: the same field). **Print** calls `window.print()`.
The component is keyed by the week, so the status starts empty on another week.

## The print stylesheet

Page chrome is hidden with Tailwind's `print:hidden` on the elements themselves (the site header with the navigation,
the page header's buttons, the **Add something else** fold-out, the progress status and bar, the ✕ forms, the pantry
section and `GroceryShare`). `app/globals.css` has one `@media print` block that redefines the colour tokens to black
on white (after the dark-mode block, so a dark scheme does not print dark), widens `main`, strips the cards' frames, padding and shadow (the list prints plain), hides ticked rows and fully ticked sections (`print:hidden` on them) and
draws checkboxes as empty squares with `appearance: none`. A new element that is only for the screen needs
`print:hidden`.

## Tests

- `tests/unit/lib/grocery.test.ts`: `groceryListText` (sections, amounts, skipped lines, empty, German).
- `tests/unit/components/grocery-share.test.tsx`: clipboard success, rejection, no clipboard, print, German, axe.
- `tests/e2e/groceries.spec.ts` ("copy and print"): the real clipboard, the print media emulation, the print button.
