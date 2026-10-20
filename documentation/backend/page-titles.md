# Page titles

`app/layout.tsx` sets `title: { default: <app name>, template: "%s - <app name>" }` in its `generateMetadata`, with the app name from
the translated message "Dinner Planner", so the separator and the name live in one place. A page exports `generateMetadata`
returning `{ title }` with only its own part, translated with `t(i18n)` from `getServerI18n()`.

- The week plan is at "/", the layout's own route segment, where Next does not apply the template: it returns `absoluteTitle()`
  (`lib/page-title.ts`) with the app name and the shared `TITLE_SEPARATOR`.
- The recipe page and the edit page load only `Recipe.name` through `recipeTitle(id)` (`lib/page-title.ts`: no photo or
  ingredients), shorten it to `MAX_TITLE_LENGTH` (60) characters and return `{}` for an unknown id, which leaves the default (the app
  name).
- `app/not-found.tsx` cannot set metadata (Next takes none from it), so it shows the default. Tests keep it that way.
- A new page needs a `generateMetadata`; `tests/infra/page-titles.test.ts` fails for a `page.tsx` without one.
- The part before the hyphen is the page's `<h1>` text, except the edit page (see [the UI chapter](../ui/page-titles.md)).
