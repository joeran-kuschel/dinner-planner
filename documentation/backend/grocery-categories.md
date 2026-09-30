# Grocery categories

Every ingredient and every hand-added grocery line belongs to a shop section, so the grocery list can be shown in the
order of a walk through the shop ([Grocery list](../ui/groceries.md)).

## The enum

`GroceryCategory` is a Prisma enum (`prisma/schema.prisma`): `PRODUCE`, `BAKERY`, `MEAT_FISH`, `DAIRY_EGGS`, `PANTRY`,
`FROZEN`, `DRINKS`, `OTHER`. The declaration order is the order of the groups on the list, so `OTHER` stays last. Both
`Ingredient.category` and `GroceryEntry.category` are required and default to `OTHER`; the migration therefore needs no
backfill, and every existing row lands in **Other**.

`lib/grocery-category.ts` is the one place that knows the set on the TypeScript side. It is safe for client code (it
imports only the generated enum constants):

- `GROCERY_CATEGORIES`: the values in list order, which also fills the `<select>`s.
- `categoryLabel(category, i18n)`: the translated name. A `switch` without a default, so adding an enum value fails the
  type check until it has a label.
- `parseGroceryCategory(raw)`: a posted value as a category; anything missing, unknown or tampered with is `OTHER`.
  Server actions are public endpoints, so a category never reaches the database unparsed.

## Where the category travels

| Step | What happens |
| ---- | ------------ |
| Recipe form | One `ingredientCategory` field per row, parallel to `ingredientName`, `ingredientQuantity` and `ingredientUnit`. `createRecipe` and `updateRecipe` parse it into `Ingredient.category`; `updateRecipe` replaces the whole ingredient set as before. A rejected form echoes the parsed category back, so the choice survives the form reset. |
| Extras | `addGroceryExtra` reads `category` and stores it on the `GroceryEntry`. Adding the same extra again moves it to the new category. |
| Aggregation | `aggregateIngredients()` copies the category onto each line. When lines merge (same name and unit) the category that comes first in list order wins, so `OTHER` never beats a real category and the line does not move when the meals are planned in another order. Amounts are unaffected. |
| Grouping | `groupByCategory()` splits the lines into `GROCERY_CATEGORIES` order and drops empty groups. Only open lines are grouped; ticked ones stay in "In the basket". |

A line's key is still `name|unit`, without the category. Tick state (`GroceryEntry` rows) is therefore untouched when an
ingredient changes section. The category of a derived line is never read from its `GroceryEntry`; it always comes from the
recipes, so editing a recipe corrects the list at once, like everything else on it.

A hand-added extra with the same name and unit as a line from the plan is not listed separately, exactly as for its
amount, so the line keeps the category of the recipes and the extra's category is ignored.

## Adding a category

Add the value to the enum (before `OTHER`) and create a migration, add its label to `categoryLabel` and translate it
(`npm run i18n:extract`). Turning the fixed set into user-editable data is a separate step (GitHub issue #29).
