# Planned meals

A `PlannedMeal` row is one day's dinner. Its primary key is the day (UTC midnight, see "Dates" in `CLAUDE.md`), so a day
has at most one dinner. A row names either a recipe (`recipeId`) or, for a dinner that is no recipe, a title of its own
(`customTitle`), never both.

The server actions live in `app/actions/meals.ts`:

| Action             | Does                                                         |
| ------------------ | ------------------------------------------------------------ |
| `setPlannedMeal`   | Plans, changes or clears one day (below).                    |
| `clearPlannedMeal` | Deletes one day's row.                                       |
| `clearWeek`        | Deletes the seven rows of the Monday-based week of `weekStart`. |

All three refresh the week view (`/`), the grocery list (`/groceries`) and the recipe pages (`/recipes` and below),
which show where each recipe is planned and list a recipe added from a day card.

## `setPlannedMeal`

The day card ([Week plan](../ui/week-plan.md)) posts these fields:

| Field       | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `day`       | The day, as `YYYY-MM-DD`. Required; anything else throws.                        |
| `dinner`    | The dinner's name as shown in the field.                                         |
| `recipeId`  | The recipe the user picked from the suggestions, or empty.                       |
| `newRecipe` | `1` when the user chose "Add … as a new recipe".                                  |
| `servings`  | People to cook for, 1–99. Missing or invalid values become 2; larger values are capped at 99. |
| `notes`     | Optional note.                                                                   |

Text is trimmed, and NUL characters (which Postgres rejects) are dropped.

The action decides what to store in one transaction, in this order:

1. **A picked recipe.** `recipeId` must name an existing recipe, or the action throws and writes nothing. It counts only
   while `dinner` is empty or still that recipe's name (ignoring case). Without JavaScript the picked id stays in the
   form while the user types another name, and the typed name must win. The id also decides between two recipes with the
   same name.
2. **A recipe of that name.** A `dinner` that matches a recipe's name (ignoring case) plans that recipe, the oldest if
   there are several. This keeps a typed name from creating a duplicate or hiding a recipe behind a one-off title.
3. **A new recipe.** With `newRecipe=1`, a recipe with just that name is created (serves 2, no ingredients) and planned.
4. **A one-off dinner.** Any other `dinner` is stored as `customTitle`.
5. **Nothing.** With no recipe and an empty `dinner`, the day's row is deleted.

The matching rule ("same dinner" = trimmed and case-insensitive) lives in `lib/planner.ts` (`isSameDinner`), so the day
card offers "Add as a new recipe" exactly when the server would create one. In the database, Prisma's case-insensitive
`equals` becomes an `ILIKE`, where `%` and `_` are wildcards; `likeLiteral` escapes them (and `\`), so "Shak_huka" does
not match "Shakshuka".

Recipe names are not unique, so two saves that both add the same new name at the very same moment (two tabs) can create
it twice. For a single user this is accepted rather than guarded by a unique index; the duplicate can be deleted from the
recipe list.

A save that fails (for example because the picked recipe was deleted in another tab) throws. The day card catches it,
says so in an alert, shows what is saved and reloads the page data; see [Week plan](../ui/week-plan.md).

## Deleting a recipe

`deleteRecipe` removes the days that only pointed at the recipe in the same transaction. The schema's
`onDelete: SetNull` alone would leave rows that name nothing: invisible in the week view but still counted as planned.

## Tests

- `tests/unit/app/actions/meals.test.ts`: every rule above, against a real Postgres schema.
- `tests/unit/lib/planner.test.ts`: the name matching.
- `tests/e2e/week-plan.spec.ts`: planning, adding a recipe from the day card, and leaving the field without picking, in
  a real browser.
