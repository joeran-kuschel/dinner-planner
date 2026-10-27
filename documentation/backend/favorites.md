# Favorites, last planned and Cook again

[Favorites and Cook again](../ui/week-plan.md#suggestions-favorites-and-cook-again) ([#7](https://github.com/joeran-kuschel/dinner-planner/issues/7)).

## Data

`Recipe.favorite` (`Boolean`, default `false`). Nothing else is stored: when a recipe was last planned is read from `PlannedMeal`, whose days
stay in the database after their week has passed. `daysSinceLastPlanned(today)` (`lib/recipe-activity.ts`, server only) groups the planned days that
name a recipe and are on or before today by recipe and takes the latest, and `daysSince()` (`lib/cook-again.ts`) turns it into whole days between two planner days
(UTC midnight, so a change of clocks does not shift it). A recipe never planned is not in the map; the page passes `daysSince: null` for it, and `undefined`
means "not known" (the day card's tests, a caller without the data): that gets no hint.

The week page, the recipe list and the recipe page compute the numbers on the server and pass them down, so the browser's clock is never involved and a day
card never disagrees with the server about what "3 weeks ago" is.

## The action

`setRecipeFavorite` (`app/actions/recipes.ts`, starts with `requireAccess()`): `id` and `favorite`; only the exact word `true` marks a recipe, anything else
(missing, `1`, `on`) takes the mark off. A recipe deleted in another tab is not an error, a missing `id` throws. It refreshes `/`, `/recipes`, `/groceries`
and the recipe's page. `components/favorite-button.tsx` is a plain form with the action, `aria-pressed`, and stays `aria-disabled` (not `disabled`, which would
drop the keyboard focus) while the save runs.

## Ranking and Cook again (`lib/cook-again.ts`, safe for client code)

- `rankForSuggestion()` (an empty dinner field): favorites first, then by `daysSince` descending, a recipe never planned or not known after those planned, in each
  group; equal ones keep the given order (the pages hand the recipes over sorted by name).
- `sortByLongestAgo()` (the list's **Planned longest ago**): the recipes never planned (or not known) first, then by `daysSince` descending, without the favorites rule; `sortByMostRecent()`
  (**Planned most recently**): by `daysSince` ascending, the recipes never planned last. Equal ones keep the given order in both. The two ranks above put a recipe never planned last for the suggestions: a day to plan, not a list to browse.
- `cookAgainSuggestions()`: the recipes not in the week shown, without a tag in `COOK_AGAIN_EXCLUDED_TAGS` (compared as tags are stored, `normalizeTag`), and due
  (`COOK_AGAIN_AFTER_DAYS`, 14 days, or never), ranked, at most `COOK_AGAIN_LIMIT` (5).
- `plannedAgoText()` and `activityHint()`: "last planned today / yesterday / N days / weeks / months / years ago", "never planned", and "Favorite · …". Weeks from 14 days,
  months from 60, years from 730, so there is never a singular other than yesterday.

The week page (`app/page.tsx`) offers the free days: the days of the week shown from today on that `isPlanned()` says nothing for. `components/cook-again.tsx` posts `day` and
`recipeId` to `planFreeDay` (`app/actions/meals.ts`): it throws without a recipe (`setPlannedMeal` would read that as "clear this day"), writes only while the day is still empty and
answers `occupied` otherwise, sharing `setWhileEmpty()` with `restorePlannedMeal` (the Undo of "Clear day"), and then runs `setPlannedMeal` for the write itself, so a recipe is planned in one way only. No
`dinner` is posted: the recipe is the one picked, by id, so a rename in another tab cannot make the action look up another recipe by the old name; a recipe deleted meanwhile throws
and the row says it could not plan. Servings are the action's default of 2. `planFreeDayFromForm` is the same for the plain form without JavaScript (a form action returns nothing). Two
plans landing within the same few milliseconds could still collide; that window is accepted, as for the Undo.

"Planned this week" looks only at the week shown; a recipe planned for a later week is still offered, while `daysSince` counts days up to today only.

## The list

`RecipeSearch` has `favorites` (`?fav=1`) and `sort`, one of `RECIPE_SORTS` in `lib/recipe-sort.ts` (client-safe, with the labels): `name` (the default, left out of the address), `newest`, `planned` and `recent`.
`readRecipeSearch()` reads them (anything but `1` means no favorites filter, an unknown sort means by name); the address is written by `recipeListHref()` and `recipeHref()` (`lib/recipe-search-url.ts`, client-safe, re-exported from
`lib/recipe-search.ts`), and `recipeSearchWhere()` adds `favorite: true`. `name` and `newest` (`createdAt` descending, then by name) are the query's `orderBy`; `planned` and `recent` are done after it, since they need the planned days.

`components/recipe-sort-select.tsx` is the select, a client component: a change moves the address with `router.replace` (a sort is no history entry: the back button leaves the list) to the search the page shows, so the filter, the
tags and the text are kept (what is typed but not searched yet stays in the box), and a polite status announces it. It follows the address when that changes by itself (the **Clear** link). It is named `sort` and sits in the search form, so the
**Search** button sends it without JavaScript.
