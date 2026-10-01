# Documentation

Feature documentation, split into the user interface and the backend.

## UI

- [Week plan](ui/week-plan.md): the day cards, the dinner field with its suggestions, and keyboard use
- [Recipes](ui/recipes.md): the recipe list and pages, the form with its photo, and deleting a recipe
- [Grocery list](ui/groceries.md): the weekly shopping list, moving between weeks, ticking off and extras
- [Buttons and touch targets](ui/buttons.md): the kinds of button, the red of destructive actions, the 44 px touch size
- [Language](ui/language.md): switching between English and German, which language you get, dates and numbers

## Backend

- [Recipe photos](backend/recipe-photos.md): where photos are kept and why, what is stored, serving and caching, upload limits, backup size
- [Recipe tags and search](backend/recipe-tags.md): the `Tag` table, the chip form, pruning, the list query and the dinner field
- [Grocery categories](backend/grocery-categories.md): the shop-section enum, how it travels from recipe form to list, merging and grouping
- [Pantry staples](backend/pantry-staples.md): the `PantryStaple` table, name-only matching, hiding at render time, the actions
- [Planned meals](backend/planned-meals.md): how `setPlannedMeal` turns a picked or typed dinner into a stored day
- [Translations (i18n)](backend/i18n.md): Lingui and the `.po` catalogs, writing translatable code, choosing and switching the language

- [Database backups](backend/database-backups.md): hourly dumps of the cluster database, restore, and the launchd job
- [The pre-push / pre-merge check](backend/testing-check.md): `npm run check`, its stages, time limits and the no-retry rule
- [Changelog](backend/changelog.md): `CHANGELOG.md`, how an entry is written, cutting a release
