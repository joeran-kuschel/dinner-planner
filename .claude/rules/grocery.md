---
paths:
  - "lib/grocery*.ts"
  - "lib/ingredients/**"
  - "lib/pantry.ts"
  - "app/groceries/**"
  - "app/actions/groceries.ts"
  - "app/actions/grocery-categories.ts"
  - "components/grocery-list.tsx"
  - "components/category-*.tsx"
  - "components/pantry-section.tsx"
  - "components/merge-lines-dialog.tsx"
  - "components/merged-lines-section.tsx"
  - "components/grocery-share.tsx"
  - "app/actions/pantry.ts"
---

# Grocery list

Details: `documentation/backend/grocery-merge.md`, `grocery-categories.md`, `grocery-carry-over.md`, `pantry-staples.md`, `grocery-copy-print.md`.

- **The list is derived, never stored.** `aggregateIngredients()` recomputes it from the week's planned meals on every render, scaling each
  recipe by `meal.servings / recipe.servings`; `GroceryEntry` rows hold only tick-off state and hand-added extras. Ingredients merge only
  when name and unit match, and one unquantified ingredient makes the whole line "to taste".
- **A line is what it is whatever it was called.** Its key (`<name id>|<unit id>`) comes from the canonicaliser
  (`lib/ingredients/canonical.ts`); build keys with it, never by hand. Stored rows are read through `keyOfStored()` / `canonicalRows()`.
  Units are never converted except a metric unit and its own multiple. A name belongs to one dictionary group only (a test checks).
  Order: add up, merge (also hand-added amounts), then `small` amounts lose their amount on screen. A name in `GroceryKeepSeparate` is
  left alone by merges and plurals.
- **Shop sections are `GroceryCategory` rows.** Items carry a `categoryId` (fallback "Other", `OTHER_CATEGORY_ID`); read and parse ids
  through `loadCategories()` / `parseCategoryId()`, never straight to Prisma; a writer that files a category goes through
  `withCategories()`. "Other" is always last and never deleted; the category is not part of a line's key. Tests keep the seeded rows.
- **Hand-added entries carry over** to the next weeks until ticked, worked out at render (`carriedEntries()`); deleting a carried line
  writes a `dismissed` row.
- **Pantry staples hide derived lines at render time** (`splitStaples()`, name only) and never hide a hand-added extra.
