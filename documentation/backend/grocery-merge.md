# Merging grocery lines

The same ingredient often arrives under different names: "Tomaten" in a German recipe and "tomatoes" in an English
one, "Knoblauchzehe" and "garlic" with the unit "clove", "EL" and "tbsp". The grocery list ([Grocery list](../ui/groceries.md))
counts them as one line. The list stays derived, never stored: what a line is called is worked out whenever the page is
built, from a bundled dictionary and from the merges the user made.

## The key of a line

A line's key is `<name id>|<unit id>` (`lib/ingredients/canonical.ts`, safe for client code):

- **Name id.** A name in the dictionary (`lib/ingredients/names.ts`) is `~<group id>` (`~tomato`, `~caraway`). Any other name
  is the typed name trimmed, inner whitespace collapsed and lowercased, or its singular when it is a plural of a name on the page
  (see "Plurals" below), unless the user keeps it on its own line (see "Names kept on their own line"). The user's merge rules are applied on top and
  followed as a chain (`followRules`, at most 20 steps), so a name merged into a name that was merged again ends at the last.
- **Unit id.** A unit in the table (`lib/ingredients/measures.ts`) is its base: "kg" counts in "g", "l" in "ml", "EL" and
  "tbsp" are both "tbsp". A unit that is not in the table stays as typed (lowercased) and merges only with itself.
  A name with an implied unit ("Knoblauchzehe", "garlic cloves": `impliesGroup`, `impliesUnit`) is `~garlic` in cloves
  when no unit was typed.

Two lines with the same key are one line, and their amounts add up. **Units are never converted**, with one exception, a metric
unit and its own multiple (g and kg, ml and l): a spoon, cup or pinch has no fixed weight (a tablespoon of salt and one of
mustard seeds weigh differently) and spoons differ between countries, so tbsp is not turned into grams or millilitres, nor into
tsp. Amounts in different units are not added: "200 g tomato" and "2 pieces tomato" stay two lines with the same name.

`createCanonicaliser({ locale, rules })` builds the functions the page uses: `identify(name, unit)` (the key and its parts),
`nameLabel(nameId)` (the name to show), `unitLabel(unit, quantity)`, `amount(...)` (the amount to show for a line summed in its
base unit), `aliases(name)` and `keyOfStored(key)`. `aggregateIngredients(meals, canon)` takes one; without it
(`PLAIN_NAMES` in `lib/grocery.ts`) names and units count exactly as typed, which is what the older tests and callers get.

## Plurals

A name that is not in the dictionary also joins its regular plural: "quinces" and "quince", "Rüben" and "Rübe". `singularCandidates()`
(`lib/ingredients/plurals.ts`, safe for client code) lists the singulars a name could have, most specific first: English `-ies`→`y`, `-ves`→`f`/`fe`,
`-oes`/`-ches`/`-shes`/`-xes`/`-sses`/`-zes` lose `es`, any other `-s` (not after s, u or i) is cut; German `-n` (after e, l or r) and `-e` are cut. The last word of a
name only ("cherry tomatoes"), at least three letters are left, and a short list of names is never cut (couscous, hummus, asparagus, …).

**A name folds only when one of its candidates is on the page**, never on the ending alone: `createCanonicaliser({ names })` gets every ingredient
name of the week's recipes and every hand-added entry that is on the list (this week's that is not deleted, an earlier week's that is still carried: not ticked, not
deleted; `pageNames()` in `lib/ingredients/rows.ts`, which the page calls before it aggregates), and `identify()`
folds a name to the first candidate that is in that set. So "shallots" next to "shallot" is one line, and a lone "Kuchen" or "Wein" is never turned into "Kuche" or
"Wei". The key still carries the unit, so "pepper" in a pinch and "peppers" in pieces stay two lines. The singular wins the label: a line is shown under the spelling
it is counted as (`quince`), whichever recipe comes first, unless the dictionary or a merge names it. `keyOfStored` runs the same fold, so a row written under
"quinces|" is read as "quince|" while "quince" is on the page. `addGroceryExtra` builds its key with the same names (`loadPageNames()`, the same queries in `lib/ingredients/server.ts`), and
updates the row of this week that the page already reads as that line instead of writing a second one. A rule made for "shallots" applies to "shallot" too: the page folds the rule's name the way it folds a name.

**The limit.** Because a plural folds only while its singular is on the page, a key is not fixed for good: a tick written under "shallot|" no longer matches when the recipe with
"shallot" leaves the week and the line is "shallots|" again (the same happens to any key when a recipe's ingredient is renamed). Nothing is lost or ticked by accident: the line is
unticked, and the row waits under its key. Folding on the ending alone would not have this, but it could not tell "olives" (olive) from "leaves" (leaf), or cut "Wein" and "Kuchen" safely.

## What a line combines

`aggregateIngredients` records the typed spellings that went into a line, by their normalised form (recipe ingredients and hand-added entries).
A line of two or more spellings carries them as `parts` (`["Tomaten", "tomatoes"]`, in the order found); a line of one has no `parts`. They are display only:
the tooltip on the line's merge button, its description for a screen reader, and the list in the merge dialog (`components/merge-lines-dialog.tsx`,
`components/grocery-list.tsx`) read them. The merge rules the user made are in `parts` too, since they join spellings the same way.

## Names kept on their own line

`GroceryKeepSeparate` (`prisma/schema.prisma`, global): a unique `name` (normalised like a merge rule's `fromName`) and the `label` the user saw. It is the way to undo an
automatic merge, by the dictionary or the plural rule: `createCanonicaliser({ keepSeparate })` gives such a name the id of its own typed name, so it joins neither the dictionary
group nor a singular, and other names do not fold into it. It is also not sent anywhere by a hand merge (`GroceryMergeRule`): "List separately" on a spelling
that a merge had joined puts it apart, and the rule stays in "Merged lines" (undo it there to merge again). A pantry staple still matches a kept name by its dictionary names (`aliases`). `loadKeepSeparate()` (`lib/ingredients/server.ts`)
reads them; `addGroceryExtra` builds its keys with them too, so an entry added under a kept name is stored under the key the page reads.

| Action (`app/actions/groceries.ts`) | Does |
| ---- | ---- |
| `keepGroceryNameSeparate` | Reads `label` (cut to 80 characters), normalises it and upserts by `name`: keeping a name again changes nothing. Answers `invalid` for nothing or a name that is too long, `limit` at 300 names (`MAX_MERGE_RULES`, a name already kept still answers `kept`), else `kept`. |
| `unkeepGroceryName` | Deletes by `id`; one already gone is not an error, a missing `id` throws. |

Both start with `requireAccess()` and revalidate `/groceries`. Ticks written while the lines were one keep the key they got then, as after undoing a hand merge
(below): after "List separately" the separated line starts unticked, and a row under the merged key belongs to the line that kept that key.

## What is shown

The page shows a line under the first name of its dictionary group in the page language, capitalised ("Knoblauch" in German,
"Garlic" in English), and its unit in the page language and in the singular or plural the amount needs ("1 Zehe", "10,5 Zehen";
`Measure.plural`). A name that is not in the dictionary is shown as typed, and a name merged by hand is shown as the name it was
merged into. Several units of one family are summed in the base unit and shown as kg or l from 1000 on; one unit throughout is shown
as it is. Switching the language changes all of this without a reload, since the page is rendered again.

Nothing stored is rewritten: recipes, hand-added entries and rules keep the text as typed.

## The dictionary

`lib/ingredients/names.ts` is a list of groups, each with the names an ingredient goes by in English and German. The first name of a
language is the one shown. The rules for editing it:

- A name belongs to **one** group (`tests/unit/lib/ingredients/names.test.ts` checks), so look-alikes are separate groups and are
  never merged on their own: "Kümmel" is caraway and "Kreuzkümmel" is cumin; milk and coconut milk, olive oil and vegetable oil,
  onion, red onion and shallot, and the tomato products (fresh, cherry, peeled, chopped, paste, passata) are all apart.
- A word that can mean two things ("Paprika": the vegetable or the powder) is left out.
- It is a file in the repository, reviewed in pull requests, and ships in the image, so the app stays stateless. It is never
  fetched at run time. The starting content came from the ingredient names in the owner's recipes plus common ones, reviewed
  by the owner (#74).

## The user's merges

`GroceryMergeRule` (`prisma/schema.prisma`, global, not per week): `fromName` (unique), `toName` (name ids), and the two labels as
the user saw them. `loadMergeRules()` (`lib/ingredients/server.ts`) reads all of them on every grocery page; a household has a handful.

| Action (`app/actions/groceries.ts`) | Does |
| ---- | ---- |
| `mergeGroceryLines` | Reads `from`, `to` (a name id: kept if it is a dictionary group, else normalised) and the labels (cut to 80 characters). Answers `invalid` for nothing to merge, the same name or a merge that would send two names round in a circle (`wouldLoop`), and `limit` at 300 rules (moving an existing rule is still allowed). Otherwise upserts by `fromName`, so merging a name again moves it, and answers `merged`. |
| `unmergeGroceryLines` | Deletes a rule by `id`; one already gone is not an error, a missing `id` throws. |

Both start with `requireAccess()` and revalidate `/groceries`. A merge is a rule on names, not on one line: it applies in every week
and to every recipe, old and new. The dialog only offers lines in the same unit, because amounts in different units are never added.

## Stored rows and old keys

`GroceryEntry` rows keep the key they were written with, so nothing is migrated. The page reads them through the canonical key
(`canonicalRows` and `withCanonicalKeys` in `lib/ingredients/rows.ts`; `keyOfStored` maps `name|unit` to the canonical key and is idempotent):
rows that now share a key are read as one, the row written with exactly that key wins, and a merged line without a row of its own is
ticked only when every part was. New ticks and hand-added entries are written under the canonical key (`addGroceryExtra` builds it with
the same canonicaliser). The carry-over of hand-added entries ([Carry-over](grocery-carry-over.md)) reads earlier weeks' rows under the same keys.

Undoing a merge lists the lines apart again, but rows written while the rule existed (a tick, a hand-added entry) keep the
key they got then, the target's. An entry added as "a" while "a" was merged into "b" is shown as "a" after the undo, but ticks and
matches under "b" (and is hidden by a derived "b" line, see below). Hand-added rows that come to share one key through a merge show
the first row's amount; amounts written before a merge are not added up.

## Pantry staples

A staple matches every name the dictionary has for it (`canon.aliases`), so the staple "Salz" hides the line a page in English calls
"Salt" ([Pantry staples](pantry-staples.md)). Matching is still by name only, and hand-added lines are never hidden.

## Hand-added entries and planned lines

An entry added by hand whose key is the same as a planned line's is that line: it is listed once, and its amount is added to the
planned one (`aggregateIngredients(meals, canon, extras)`: 200 g flour planned plus "2 kg flour" added by hand is 2.2 kg; in the
base unit, so g and kg add up). An entry without an amount adds nothing, and a line that reads "to taste" stays so. The entry still
carries the tick state and is not hidden by a pantry staple. Because the key no longer depends on the language or the spelling, this
happens for "2 kg flour" and "Mehl" too, not only for the identical name.

## Small amounts (#61)

The last step of the list, after adding up, merging and the hand-added amounts: `aggregateIngredients` sets `small` on a line when
`isSmallAmount(unitId, quantity)` (`lib/ingredients/measures.ts`) says so, on the **merged total in the base unit**: any amount of a
unit flagged `small: true` in the unit table (tsp, tbsp, pinch, dash, knife tip, so "EL", "TL", "Prise" and "Messerspitze" too), or a
weight under `SMALL_WEIGHT_GRAMS` (100 g; a kilogram amount is already counted in g). Deciding on the total is why 60 g and 50 g of
tomatoes stay visible. A line without an amount and a line in any other unit (piece, clove, cup, ml, l) is never small.

`small` changes the display only: the key, the quantity and the tick state are untouched. the list component leaves the amount out (the merge dialog still shows it, as it is where a total is
decided) and `groceryListText` writes "- Salt" for a small line, so the screen, the copy and the printout agree. The page clears `small` on a line
that has a hand-added or carried entry with the same key behind it (`handAdded`, even one without an amount), since what was typed by hand is never changed. Volumes are not covered. Without a
dictionary (`PLAIN_NAMES`) the unit is the typed one, so only the units named exactly like a unit id ("g", "tsp") count.

## Not done yet (#73)

Stage 3 (suggesting a merge where the app is not sure, with "Merge" and "Keep separate") is separate. Stage 2 is done: the dictionary, the
unit table, the plural rule, the spellings a line combines and the names kept apart.
