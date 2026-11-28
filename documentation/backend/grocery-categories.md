# Grocery categories

Every ingredient and every hand-added grocery line belongs to a shop section, so the grocery list can be shown in the
order of a walk through the shop ([Grocery list](../ui/groceries.md)).

## The table

The shop sections are rows of the `GroceryCategory` table (`prisma/schema.prisma`): `id`, `key`, `name` and `position`
(from 0, in the order of a walk through the shop). `Ingredient.categoryId` and `GroceryEntry.categoryId` are required
foreign keys (`onDelete: Restrict`: a category with items cannot be deleted from under them; the code that deletes one moves
its items to "Other" first, in the same transaction).

The ten sections the app had as an enum became the table's first rows (the migration `grocery_categories_table`): `PRODUCE`,
`BAKERY`, `MEAT_FISH`, `DAIRY_EGGS`, `PASTA_RICE`, `PANTRY`, `HERBS_SPICES`, `FROZEN`, `DRINKS` and `OTHER`, with the fixed ids
`cat_produce`, `cat_bakery` … `cat_other`. They have a `key` and **no `name`**, so they stay translated: `categoryName()` shows
the user's `name` when there is one and otherwise the translated label of the key, in the page's language. A category the
user adds (issue #29, the management page) has a `name` and no `key`. `OTHER` is where items fall back to, so it always
exists and stays last: that is an invariant the code relies on (the actions file a row without a section under `OTHER_CATEGORY_ID`), and the page that deletes categories must keep it. The migration kept every ingredient's and grocery entry's section (it joins on the old enum value) and
tick state, which never depended on it.

`lib/grocery-category.ts` is the one place that knows the set on the TypeScript side. It is safe for client code (it imports
no Prisma client):

- `CategoryRow`: `{ id, key, name, position }`, what pages and helpers pass around. Lines, carried entries and ingredients
  carry the whole row, so grouping and the "first in the shop wins" rule read the row's `position` and need no list.
- `SEEDED_CATEGORIES` and `seededCategory(key)`: the ten rows the migration creates (a test compares them with the database),
  for the seed data and the tests. `OTHER_CATEGORY_ID` is the fallback's id.
- `categoryName(category, i18n)`: the name shown. The labels of the seeded keys are a `switch` without a default, so a new
  seeded key fails the type check until it has a label.
- `parseCategoryId(raw, categories)`: a posted value as a category id; anything missing, unknown or tampered with is "Other".
  Server actions are public endpoints, so a category never reaches the database unparsed.

`lib/grocery-category-server.ts` (`loadCategories()`) reads the rows in shop order; the pages that show or save a category call it
and hand the rows to the forms (`CategorySelect`, `RecipeForm`).

## Where the category travels

| Step | What happens |
| ---- | ------------ |
| Recipe form | One `ingredientCategory` field per row (a category id), parallel to `ingredientName`, `ingredientQuantity` and `ingredientUnit`. `createRecipe` and `updateRecipe` parse it into `Ingredient.categoryId`; `updateRecipe` replaces the whole ingredient set as before. A rejected form echoes what was posted, so the choice survives the form reset (a row whose section is gone shows "Other"). An empty value is "Other": a recipe imported from a link starts its rows there. |
| Extras | `addGroceryExtra` reads `category` (an id) and stores it as the `GroceryEntry`'s `categoryId`. Adding the same extra again moves it to the new category. |
| Aggregation | `aggregateIngredients()` copies the category onto each line. When lines merge (same name and unit) the category with the lowest `position` wins, so `OTHER` never beats a real category and the line does not move when the meals are planned in another order. Amounts are unaffected. |
| Grouping | `groupByCategory()` groups the lines by their category row, in `position` order, and has no empty groups. All lines are grouped, ticked ones too: a ticked line stays in its section. |

A line's key is still `name|unit`, without the category. Tick state (`GroceryEntry` rows) is therefore untouched when an
ingredient changes section. The category of a derived line is never read from its `GroceryEntry`; it always comes from the
recipes, so editing a recipe corrects the list at once, like everything else on it.

A hand-added extra with the same name and unit as a line from the plan is not listed separately, exactly as for its
amount, so the line keeps the category of the recipes and the extra's category is ignored.

`PASTA_RICE` and `HERBS_SPICES` came later (issues #43 and #39) as enum values; the table migration turned them into rows like the rest.

## Rolling out the migration

The migration runs in the app pod's init container and has no way back: the old image reads the dropped `category` column, so a
rollback to the previous image needs the backup restored. Run `npm run k8s:backup` before the deploy that brings it.

## Adding a category

Part of #29: the table is there, the page that adds, renames, moves and deletes categories comes next. Until then a seeded
section is changed with a migration.
