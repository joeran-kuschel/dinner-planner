# Page titles

Every page's browser tab, history entry and bookmark is titled `<page> - Dinner Planner` (German: `<page> - Abendessen-Planer`),
so tabs can be told apart and a screen reader announces where the user is (WCAG 2.4.2 Page Titled). The separator is a hyphen
with a space on each side in both languages. The layout's title template adds the app name once (`app/layout.tsx`); a page
supplies only its own part through `generateMetadata`.

| Page | Title (English) | Same as the `<h1>`? |
| --- | --- | --- |
| Week plan (home), whichever week | Week plan | yes |
| Recipes | Recipes | yes |
| New recipe | New recipe | yes |
| A recipe | the recipe's name, e.g. "Spaghetti carbonara" | yes (up to 60 characters) |
| Edit a recipe | "Edit Spaghetti carbonara" | no: the `<h1>` is "Edit recipe"; the name is what tells two tabs apart |
| Grocery list | Grocery list | yes (the navigation says "Groceries") |
| Not found, unknown address or deleted recipe | Dinner Planner (just the app name) | no |

A recipe name is user text: it is shown as plain text, never as markup, and one longer than 60 characters is cut with "…"
(`shortenTitle()` in `lib/page-title.ts`). A recipe that does not exist gets the not-found page and so the bare app name.
Titles follow the language switcher without a reload. The access-link page (answered with 401 outside the layout) keeps its own title.

Technical details: [documentation/backend/page-titles.md](../backend/page-titles.md).
