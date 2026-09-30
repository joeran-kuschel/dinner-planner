# Recipe tags and search

Recipes carry tags, and the recipe list and the day card's dinner field can find recipes by them
([Recipes](../ui/recipes.md), [Week plan](../ui/week-plan.md)).

## Data

`Tag` (`prisma/schema.prisma`) has an `id` and a unique `name`; `Recipe.tags` is an implicit many-to-many, which Prisma
keeps in the `_RecipeToTag` table. Deleting a recipe removes its rows in that table, not the tag.

- **Names are stored normalised** (`normalizeTag` in `lib/tags.ts`): trimmed, inner whitespace collapsed, lowercase. The
  unique index is case-sensitive, so this is what makes "Quick" and "quick " one tag. Every path that stores a tag goes
  through it (`parseTags` for the form, the seed writes lowercase names).
- **Unused tags are deleted.** `updateRecipe` and `deleteRecipe` run `prisma.tag.deleteMany({ where: { recipes: { none: {} } } })`
  in the same transaction as the change, so the tags offered in the filter and while typing are exactly the ones in use.
  The seed only adds tags: running it again never takes a tag away.
- **Limits** are in `lib/tags.ts`: `MAX_TAGS` (10) per recipe and `MAX_TAG_LENGTH` (30). The actions refuse a form that
  is over either, with the usual echo, rather than dropping tags silently. The chip input stops at the maximum on its own.

## Concurrent saves

`connectOrCreate` looks a tag up and inserts it when it is missing, so two saves adding the same new tag at once (a double
submit, two tabs) can both insert; the second breaks the unique name (Prisma `P2002`). `retryOnTagRace()` in
`app/actions/recipes.ts` runs the same save once more, when the tag exists. Other errors are not retried. The pruning of
unused tags is a separate statement, so in theory it can delete a tag that a save connects at that very moment; with one
user that window is not worth a lock.

## The form

The chips post as repeated `tag` fields, and the text field as `tags`; `parseTags(chips, draft)` reads both, so text still
in the field when the form is sent counts, and a browser without JavaScript can type `quick, vegan`. `createRecipe` writes
the tags with `connectOrCreate`; `updateRecipe` uses `set: []` and `connectOrCreate` in one update, like the ingredient
replace. `RecipeFormValues.tags` echoes the normalised tags of a refused form back, and the form re-seeds its chips from
them (`key` on `attempt`, as for the ingredient rows). The chips are state in `components/tag-input.tsx`, so React 19's
form reset does not empty them.

## Search

`lib/recipe-search.ts` (server only):

- `readRecipeSearch(searchParams)` turns `?q=…&tag=…&tag=…` into `{ text, tags }`: text trimmed, tags normalised and
  without duplicates, anything else ignored.
  The address is user input, so NUL characters (which Postgres refuses) are dropped, the word is cut at
  `MAX_SEARCH_LENGTH` (100), and at most `MAX_TAGS` tags of at most `MAX_TAG_LENGTH` characters are read.
- `recipeSearchWhere(search)` builds the Prisma filter: the text must be **contained** (case-insensitive) in the name, in
  a tag name or in an ingredient name; each chosen tag must be on the recipe (AND) and is matched **exactly**. `%`, `_` and
  `\` in the text are escaped, because `contains` hands them on as `LIKE` wildcards.
- `searchTerms()` lists every recipe name, tag and ingredient name once, for the search box's suggestions. A word that is
  more than one thing (a recipe called "Lemon" and an ingredient "lemon") is listed as the first kind, in the order
  recipe, tag, ingredient. The page reads this list on every visit and passes it to the box as a prop, which is fine for
  the size of one household's recipes; a lookup while typing (a route handler) would replace it if the list ever grew.
- `tagNames()` lists the tags in use for the filter's checkboxes and the form's suggestions.

The suggestions are computed in the browser: `searchSuggestions(terms, typed)` in `lib/recipe-search-terms.ts` (client-safe)
returns nothing below `MIN_SUGGESTION_LENGTH` (3) letters and otherwise at most `MAX_SUGGESTIONS` (8) terms containing
the text, those that start with it first. `components/recipe-search-box.tsx` shows them as a Downshift combobox, like the
day card's dinner field: the text follows every keystroke in the input's own `onChange`, Tab does not pick, and Enter with
nothing highlighted is passed on to the browser so it sends the form. A pick fills the field and calls `requestSubmit()`
once the field shows the picked text.

`/recipes` is a server page over these with a plain GET form (`role="search"`), so there is no client state and the result
is a URL. The count of all recipes is only read while searching ("3 of 12 recipes"). The query still selects no image
bytes.

## The dinner field

`app/page.tsx` passes each recipe's tag names to `DayCard`. `suggestsRecipe` (name) is unchanged; `matchingTag()` in
`lib/planner.ts` names the tag that made a recipe a suggestion when the name did not. The server's resolution of a typed
dinner (`isSameDinner`, see [Planned meals](planned-meals.md)) stays name-only, so a tag never picks a recipe by itself.
